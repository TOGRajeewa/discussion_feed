<#
  Checks Social Corner expiry against a live site, as real users, on posts it
  creates (and deletes again at the end):

    * the PublishedOn / ApprovedBy / Expired columns are in place;
    * approving with PublishedOn and ApprovedBy in the same write -- what the
      widget does -- leaves the post Approved;
    * Expire-SocialPosts.ps1 flags only posts older than the cut-off, using
      PublishedOn or, without it, the last-modified date, and they stay
      Approved;
    * the widget's feed query hides expired posts and keeps older posts whose
      Expired is still empty; expired posts are still in the list;
    * writing Expired on its own sends a post back to Pending, which is why
      the job never does that.

    pwsh .\Test-Expiry.ps1 -SiteUrl "http://124.43.17.138:9371"
#>
#Requires -Version 7.0
param(
  [Parameter(Mandatory = $true)] [string] $SiteUrl,
  [string] $Domain = 'ad-him',
  [string] $AuthorUser = 'testuser2',      # ordinary user, Communications
  [string] $ApproverUser = 'commadmin',    # Dept Admins - Communications
  [string] $ReaderUser = 'spadmin',        # ordinary reader: not an approver
  [string] $SuperAdminUser = 'superadmin'  # site collection administrator
)

$ErrorActionPreference = 'Continue'
$SiteUrl = $SiteUrl.TrimEnd('/')
Import-Module (Join-Path $PSScriptRoot 'TestAccounts.psm1') -Force
function Cred($u) { Get-TestCredential -User $u -Domain $Domain }

$pass = 0; $fail = 0
function Check([string] $desc, [bool] $ok, [string] $detail) {
  if ($ok) { $script:pass++; Write-Host "  PASS  $desc" -ForegroundColor Green }
  else     { $script:fail++; Write-Host "  FAIL  $desc" -ForegroundColor Red; Write-Host "        $detail" -ForegroundColor DarkGray }
}
function Req {
  param($Cred, [string] $Path, [string] $Method = 'Get', $Body, [hashtable] $Extra)
  $h = @{ Accept = 'application/json;odata=nometadata' }
  if ($Extra) { $Extra.GetEnumerator() | ForEach-Object { $h[$_.Key] = $_.Value } }
  $req = @{ Uri = "$SiteUrl/_api$Path"; Method = $Method; Headers = $h
            Credential = $Cred; AllowUnencryptedAuthentication = $true }
  if ($Body) { $req['Body'] = ($Body | ConvertTo-Json -Depth 10 -Compress); $req['ContentType'] = 'application/json;odata=verbose' }
  try {
    $r = Invoke-WebRequest @req -ErrorAction Stop
    $data = if ([string]::IsNullOrWhiteSpace($r.Content)) { $null } else { $r.Content | ConvertFrom-Json -AsHashtable }
    return @{ Ok = $true; Status = [int]$r.StatusCode; Data = $data }
  } catch {
    return @{ Ok = $false; Status = [int]$_.Exception.Response.StatusCode; Data = $null; Err = $_.Exception.Message }
  }
}
function Digest($Cred) { (Req $Cred '/contextinfo' 'Post').Data.FormDigestValue }
function Why($r) { "status $($r.Status) $($r.Err)" }

$L = "/web/lists/getbytitle('DiscussionPosts')"
$author = Cred $AuthorUser; $approver = Cred $ApproverUser; $reader = Cred $ReaderUser; $super = Cred $SuperAdminUser
$type = (Req $super "$L`?`$select=ListItemEntityTypeFullName").Data.ListItemEntityTypeFullName
function Merge($Cred, [int] $Id, [hashtable] $Fields) {
  $Fields['__metadata'] = @{ type = $type }
  Req $Cred "$L/items($Id)" 'Post' $Fields @{ 'X-RequestDigest' = (Digest $Cred); 'X-HTTP-Method' = 'MERGE'; 'IF-MATCH' = '*' }
}
function State([int] $Id) { (Req $super "$L/items($Id)?`$select=Id,OData__ModerationStatus,Expired,PublishedOn,ApprovedById,Log").Data }
# The widget's feed query (FeedService.getPostsFirstPage), as an ordinary reader.
function FeedIds() {
  $r = Req $reader ("$L/items?`$select=Id,Title,Body,Category,Created,Department,DepartmentId,AuthorId,Author/Title,Author/EMail," +
                    "MentionedUsers/Title,MentionedUsers/Name,MentionedUsers/EMail&`$expand=Author,MentionedUsers" +
                    "&`$filter=OData__ModerationStatus eq 0 and Expired ne 1&`$orderby=Created desc&`$top=500")
  if (-not $r.Ok) { Write-Host "        feed query failed: $(Why $r)" -ForegroundColor DarkGray; return @() }
  return @($r.Data.value | ForEach-Object { $_.Id })
}
$marker = "expiry-test $(Get-Date -Format 'yyyyMMdd-HHmmss')"

# ---------------------------------------------------------------- set-up --
Write-Host "`nSet-up" -ForegroundColor Cyan
$f = @{}
foreach ($x in (Req $super "$L/fields?`$select=InternalName,TypeAsString,Indexed").Data.value) { $f[$x.InternalName] = $x }
Check 'PublishedOn column (date and time)' ($f['PublishedOn'] -and $f['PublishedOn'].TypeAsString -eq 'DateTime') 'run Provision-Expiry.ps1'
Check 'ApprovedBy column (person)' ($f['ApprovedBy'] -and $f['ApprovedBy'].TypeAsString -eq 'User') 'run Provision-Expiry.ps1'
Check 'Expired column (yes/no, indexed)' ($f['Expired'] -and $f['Expired'].TypeAsString -eq 'Boolean' -and $f['Expired'].Indexed) 'run Provision-Expiry.ps1'
Check 'Log column (multi-line text)' ($f['Log'] -and $f['Log'].TypeAsString -eq 'Note') 'run Provision-Expiry.ps1'
if ($fail) { Write-Host "`n$pass passed, $fail failed" -ForegroundColor Red; exit 1 }

$approverId = (Req $approver '/web/currentuser?$select=Id').Data.Id
$dept = (Req $author "/web/lists/getbytitle('Departments')/items?`$select=Id,Title&`$filter=Title eq 'Communications'").Data.value[0]
function NewPost([string] $suffix) {
  $r = Req $author "$L/items" 'Post' @{ __metadata = @{ type = $type }; Title = "$marker $suffix"; Body = "<p>$marker $suffix</p>"
         Category = 'Discussion'; Department = $dept.Title; DepartmentId = $dept.Id } @{ 'X-RequestDigest' = (Digest $author) }
  return $r.Data.Id
}

# ---------------------------------------------------------------- approve --
Write-Host "`nApprove (as the widget does)" -ForegroundColor Cyan
$a = NewPost 'A (fresh)'; $b = NewPost 'B (70 days old)'; $c = NewPost 'C (approved from the list)'
$r = Merge $approver $a @{ OData__ModerationStatus = 0; OData__ModerationComments = ''; PublishedOn = (Get-Date).ToUniversalTime().ToString('o'); ApprovedById = $approverId }
$s = State $a
Check "approving with PublishedOn + ApprovedBy keeps the post Approved" ($r.Ok -and $s.OData__ModerationStatus -eq 0) "$(Why $r); status $($s.OData__ModerationStatus)"
Check "PublishedOn and ApprovedBy are recorded" ([bool]$s.PublishedOn -and $s.ApprovedById -eq $approverId) "PublishedOn=$($s.PublishedOn) ApprovedById=$($s.ApprovedById)"
Merge $approver $b @{ OData__ModerationStatus = 0; OData__ModerationComments = ''; PublishedOn = (Get-Date).ToUniversalTime().AddDays(-70).ToString('o'); ApprovedById = $approverId } | Out-Null
Merge $approver $c @{ OData__ModerationStatus = 0; OData__ModerationComments = '' } | Out-Null   # no PublishedOn: as if approved in the list
$feed = FeedIds
Check "$ReaderUser sees all three in the widget's feed" (($feed -contains $a) -and ($feed -contains $b) -and ($feed -contains $c)) "feed has: $(($feed | Where-Object { $_ -in $a, $b, $c }) -join ',')"

# -------------------------------------------------------------------- job --
Write-Host "`nExpire-SocialPosts.ps1" -ForegroundColor Cyan
$job = Join-Path $PSScriptRoot 'Expire-SocialPosts.ps1'
& $job -SiteUrl $SiteUrl -Credential $super -PostId $a, $b, $c -DryRun *> $null
$sa = State $a; $sb = State $b
Check 'a dry run changes nothing' (-not $sa.Expired -and -not $sb.Expired) "A=$($sa.Expired) B=$($sb.Expired)"

& $job -SiteUrl $SiteUrl -Credential $super -PostId $a, $b, $c *> $null
$sa = State $a; $sb = State $b; $sc = State $c
Check 'post published 70 days ago is now Expired (default 60 days)' ($sb.Expired -eq $true) "Expired=$($sb.Expired)"
Check '...and still Approved' ($sb.OData__ModerationStatus -eq 0) "status $($sb.OData__ModerationStatus)"
Check '...with a Log line saying when, by whom and why' `
  ([string]$sb.Log -match '^\d{4}-\d\d-\d\d \d\d:\d\d UTC  Expired = Yes, set by Expire-SocialPosts\.ps1 as .+: published .+\(PublishedOn\), more than 60 days ago\. Kept Approved') "Log: $($sb.Log)"
Check 'post published today is not expired' (-not $sa.Expired) "Expired=$($sa.Expired)"
Check 'post approved today from the list (no PublishedOn) is not expired' (-not $sc.Expired) "Expired=$($sc.Expired)"

& $job -SiteUrl $SiteUrl -Credential $super -PostId $c -Days 0 *> $null
$sc = State $c
Check 'without PublishedOn the last-modified date is used (-Days 0 expires it)' ($sc.Expired -eq $true -and $sc.OData__ModerationStatus -eq 0) "Expired=$($sc.Expired) status $($sc.OData__ModerationStatus)"
Check '...and its Log names the date it used (Modified)' ([string]$sc.Log -match '\(Modified\), more than 0 days ago') "Log: $($sc.Log)"

# A second change is appended, not overwritten: put an earlier line in first.
Merge $super $a @{ Log = 'earlier entry'; OData__ModerationStatus = 0 } | Out-Null
& $job -SiteUrl $SiteUrl -Credential $super -PostId $a -Days 0 *> $null
$sa = State $a
Check 'the job appends to an existing Log' (([string]$sa.Log -split "`n").Count -eq 2 -and ([string]$sa.Log).StartsWith('earlier entry')) "Log: $($sa.Log)"
Merge $super $a @{ Expired = $false; Log = ''; OData__ModerationStatus = 0 } | Out-Null   # un-expire A for the checks below

# ----------------------------------------------------------------- widget --
Write-Host "`nWhat readers see" -ForegroundColor Cyan
$feed = FeedIds
Check 'expired posts are gone from the widget feed' (-not ($feed -contains $b) -and -not ($feed -contains $c)) "feed still has: $(($feed | Where-Object { $_ -in $b, $c }) -join ',')"
Check 'the fresh post is still in it' ($feed -contains $a) ''
$older = (Req $super "$L/items?`$select=Id,Expired&`$filter=OData__ModerationStatus eq 0&`$top=500").Data.value |
           Where-Object { $null -eq $_.Expired -and $_.Id -notin $a, $b, $c } | Select-Object -First 1
if ($older) { Check "an older post with Expired still empty stays visible (post $($older.Id))" ($feed -contains $older.Id) '' }
$one = Req $reader "$L/items($b)?`$select=Id,Expired"
Check 'an expired post is still in the list, flagged Expired' ($one.Ok -and $one.Data.Expired -eq $true) (Why $one)

# ---------------------------------------------------------------- the trap --
Write-Host "`nWhy the job restates Approved" -ForegroundColor Cyan
Merge $super $a @{ Expired = $true } | Out-Null
$sa = State $a
$seen = (Req $reader "$L/items($a)?`$select=Expired").Data
Check 'writing Expired on its own sends the post back to Pending' ($sa.OData__ModerationStatus -eq 2) "status $($sa.OData__ModerationStatus)"
Check '...while readers keep seeing the old approved copy (not expired)' ($seen.Expired -eq $false) "reader sees Expired=$($seen.Expired)"

# ---------------------------------------------------------------- cleanup --
foreach ($id in $a, $b, $c) {
  Req $super "$L/items($id)" 'Post' $null @{ 'X-RequestDigest' = (Digest $super); 'X-HTTP-Method' = 'DELETE'; 'IF-MATCH' = '*' } | Out-Null
}

Write-Host ''
$colour = if ($fail) { 'Red' } else { 'Green' }
Write-Host "$pass passed, $fail failed" -ForegroundColor $colour
if ($fail) { exit 1 }
