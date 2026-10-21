<#
  Nightly job: flags Social Corner posts Expired once they were published more
  than 60 days ago (the client's figure; -Days changes it). The widget then
  stops showing them (home page and the full Social Corner page). Nothing is
  deleted: the posts stay in DiscussionPosts with Expired = Yes. The Market
  Place is not touched.

  A post's age counts from PublishedOn, which the widget records on
  Approve. Posts approved before that existed, or approved from the
  SharePoint list, have none; for them the last-modified date is used, which
  for an approved post is its approval time (likes and comments are stored in
  other lists, so they do not change it).

  Each post is flagged in ONE write that also restates Approved and appends a
  line to its Log column (when, by which account, why). Written on its own,
  Expired sends the post back to Pending, and readers keep seeing the old
  approved copy until someone approves the change (checked on dev); in the
  same write as the status it never passes through Pending at all.

  Schedule it daily in Task Scheduler under an account that is a Site
  Collection Administrator; without -Credential it signs in as that account.
  Exit code 1 when any post could not be flagged, so the task shows a failure.

    pwsh .\Expire-SocialPosts.ps1 -SiteUrl "https://mansaladev.cbsl.lk" -DryRun
    pwsh .\Expire-SocialPosts.ps1 -SiteUrl "https://mansaladev.cbsl.lk" -LogPath "D:\Logs\social-expiry.log"
#>
#Requires -Version 7.0
param(
  [Parameter(Mandatory = $true)] [string] $SiteUrl,
  [pscredential] $Credential,
  # Age, in days since publishing, at which a post expires.
  [int] $Days = 60,
  # Only these posts: for testing, or to check particular posts.
  [int[]] $PostId,
  [string] $LogPath,
  [switch] $DryRun
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'SPRest.psm1') -Force

function Log([string] $Message, [string] $Colour = 'Gray') {
  $line = '{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), $Message
  Write-Host $line -ForegroundColor $Colour
  if ($LogPath) { Add-Content -Path $LogPath -Value $line -Encoding utf8 }
}

# JSON dates arrive as DateTime (or a string); compare everything in UTC.
function AsUtc($v) {
  if ($v -is [datetimeoffset]) { return $v.UtcDateTime }
  if ($v -is [datetime]) {
    if ($v.Kind -eq [DateTimeKind]::Unspecified) { return [datetime]::SpecifyKind($v, [DateTimeKind]::Utc) }
    return $v.ToUniversalTime()
  }
  return ([datetimeoffset]::Parse([string]$v)).UtcDateTime
}

Connect-SPRest -SiteUrl $SiteUrl -Credential $Credential
$runner = Invoke-SPGet '/web/currentuser?$select=Title,IsSiteAdmin'
if (-not $runner.IsSiteAdmin) {
  $msg = "$($runner.Title) is not a Site Collection Administrator; only one can flag approved posts without sending them to Pending."
  if ($DryRun) { Write-Host "WARNING: $msg" -ForegroundColor Yellow } else { throw $msg }
}

$L = "/web/lists/getbytitle('DiscussionPosts')"
$type = (Invoke-SPGet "$L`?`$select=ListItemEntityTypeFullName").ListItemEntityTypeFullName
$fields = (Invoke-SPGet "$L/fields?`$select=InternalName").value.InternalName
foreach ($need in 'Expired', 'PublishedOn', 'Log') {
  if ($fields -notcontains $need) { throw "DiscussionPosts has no $need column. Run Provision-Expiry.ps1 first." }
}
$runnerName = "$($runner.Title)"

$cutoff = (Get-Date).ToUniversalTime().AddDays(-$Days)
Log ("Expire-SocialPosts: posts published before {0:yyyy-MM-dd HH:mm} UTC ({1} days){2}" -f $cutoff, $Days, $(if ($DryRun) { ' -- DRY RUN' } else { '' })) 'Cyan'

# Approved and not yet expired. "ne 1" also matches posts from before the
# column existed, which read empty rather than No.
$filter = 'OData__ModerationStatus eq 0 and Expired ne 1'
if ($PostId) { $filter += ' and (' + (($PostId | ForEach-Object { "Id eq $_" }) -join ' or ') + ')' }
$next = "$L/items?`$select=Id,Title,PublishedOn,Modified,Log&`$filter=$filter&`$orderby=Id&`$top=500"
$rows = [System.Collections.Generic.List[object]]::new()
while ($next) {
  $page = Invoke-SPGet $next -AsHashtable
  foreach ($r in @($page.value)) { $rows.Add($r) }
  $next = $page['odata.nextLink']
}

$expired = 0; $failed = 0
foreach ($r in $rows) {
  $from = if ($r.PublishedOn) { 'PublishedOn' } else { 'Modified' }
  $published = AsUtc $r[$from]
  if ($published -ge $cutoff) { continue }

  $title = ([string]$r.Title)
  if ($title.Length -gt 60) { $title = $title.Substring(0, 60) + '...' }
  $what = "post {0} ({1} {2:yyyy-MM-dd}) {3}" -f $r.Id, $from, $published, $title
  if ($DryRun) { Log "would expire $what"; $expired++; continue }

  # Appended to whatever the Log already holds; newest line last.
  $entry = ("{0:yyyy-MM-dd HH:mm} UTC  Expired = Yes, set by Expire-SocialPosts.ps1 as {1}: published {2:yyyy-MM-dd HH:mm} UTC " +
            "({3}), more than {4} days ago. Kept Approved in the same update; hidden from the Social Corner feed.") -f `
           (Get-Date).ToUniversalTime(), $runnerName, $published, $from, $Days
  $log = if ([string]::IsNullOrWhiteSpace([string]$r.Log)) { $entry } else { ([string]$r.Log).TrimEnd() + "`n" + $entry }

  try {
    Invoke-SPPost "$L/items($($r.Id))" @{
      __metadata             = @{ type = $type }
      Expired                = $true
      OData__ModerationStatus = 0
      Log                    = $log
    } -Merge | Out-Null
    $now = Invoke-SPGet "$L/items($($r.Id))?`$select=Expired,OData__ModerationStatus"
    if ($now.Expired -and $now.OData__ModerationStatus -eq 0) {
      Log "expired $what" 'Green'; $expired++
    } else {
      Log "FAILED $what -- now Expired=$($now.Expired), status=$($now.OData__ModerationStatus)" 'Red'; $failed++
    }
  } catch {
    Log "FAILED $what -- $($_.Exception.Message)" 'Red'; $failed++
  }
}

$verb = if ($DryRun) { 'would expire' } else { 'expired' }
Log ("checked {0} live post(s): {1} {2}, {3} failed" -f $rows.Count, $verb, $expired, $failed) $(if ($failed) { 'Red' } else { 'Cyan' })
if ($failed) { exit 1 }
