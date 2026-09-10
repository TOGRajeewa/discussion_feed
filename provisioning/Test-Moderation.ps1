<#
  Verifies that Phase 1 is enforced by SharePoint rather than by the widget.

  Every check runs as a real named account, NOT as System Account -- System
  Account is a site collection administrator and bypasses exactly the
  permissions under test, so a green run under it would prove nothing.

    .\Test-Moderation.ps1 -SiteUrl "http://124.43.17.138:9371"
#>
param(
  [Parameter(Mandatory = $true)] [string] $SiteUrl,
  [string] $Domain = 'ad-him'
)

$ErrorActionPreference = 'Continue'
$SiteUrl = $SiteUrl.TrimEnd('/')

# Test accounts, per the environment hand-over.
$accounts = @(
  @{ User = 'testuser2'; Pass = 'REDACTED'; Role = 'plain user (Communications)' }
  @{ User = 'spuser';    Pass = 'REDACTED'; Role = 'dept admin (Bank Supervision)' }
)

function Cred($u, $p) {
  [pscredential]::new("$Domain\$u", (ConvertTo-SecureString $p -AsPlainText -Force))
}

function Call {
  param($Cred, [string] $Path, [string] $Method = 'Get', $Body, [hashtable] $Extra)
  $h = @{ Accept = 'application/json;odata=nometadata' }
  if ($Extra) { $Extra.GetEnumerator() | ForEach-Object { $h[$_.Key] = $_.Value } }
  $req = @{
    Uri = "$SiteUrl/_api$Path"; Method = $Method; Headers = $h
    Credential = $Cred; AllowUnencryptedAuthentication = $true
  }
  if ($Body) { $req['Body'] = ($Body | ConvertTo-Json -Depth 10 -Compress); $req['ContentType'] = 'application/json;odata=verbose' }
  try {
    $r = Invoke-WebRequest @req -ErrorAction Stop
    return @{ Ok = $true; Status = [int]$r.StatusCode; Content = $r.Content }
  } catch {
    return @{ Ok = $false; Status = [int]$_.Exception.Response.StatusCode; Content = "$($_.Exception.Message)" }
  }
}

function Digest($Cred) {
  (Call $Cred '/contextinfo' 'Post').Content | ConvertFrom-Json | ForEach-Object { $_.FormDigestValue }
}

$pass = 0; $fail = 0
$leftovers = @()   # test posts the accounts under test are (correctly) unable to delete
function Check([string] $desc, [bool] $ok, [string] $detail) {
  if ($ok) { $script:pass++; Write-Host "  PASS  $desc" -ForegroundColor Green }
  else     { $script:fail++; Write-Host "  FAIL  $desc" -ForegroundColor Red; Write-Host "        $detail" -ForegroundColor DarkGray }
}

foreach ($a in $accounts) {
  Write-Host "`n=== $Domain\$($a.User) -- $($a.Role) ===" -ForegroundColor Cyan
  $c = Cred $a.User $a.Pass

  $who = Call $c '/web/currentuser'
  if (-not $who.Ok) { Check "can reach the site" $false $who.Content; continue }
  $me = $who.Content | ConvertFrom-Json
  Write-Host "  signed in as $($me.Title) (id $($me.Id), siteAdmin=$($me.IsSiteAdmin))" -ForegroundColor DarkGray
  Check "is NOT a site collection admin (otherwise this test proves nothing)" (-not $me.IsSiteAdmin) "IsSiteAdmin=$($me.IsSiteAdmin)"

  # --- requirement 7 / 12: pending posts must be unreadable, not just unrendered
  $r = Call $c "/web/lists/getbytitle('DiscussionPosts')/items?`$filter=OData__ModerationStatus ne 0&`$top=50"
  $pending = if ($r.Ok) { (($r.Content | ConvertFrom-Json -AsHashtable).value).Count } else { -1 }
  $isApprover = $a.Role -like 'dept admin*'
  if ($isApprover) {
    Check "approver CAN query pending posts" ($r.Ok) "status $($r.Status)"
  } else {
    Check "plain user CANNOT read any pending post via REST" ($r.Ok -and $pending -eq 0) "returned $pending row(s), status $($r.Status)"
  }

  # --- requirement 1 / 5: a new post must land as Pending, never Approved
  $d = Digest $c
  $add = Call $c "/web/lists/getbytitle('DiscussionPosts')/items" 'Post' `
    @{ __metadata = @{ type = 'SP.Data.DiscussionPostsListItem' }
       Title = "moderation test $(Get-Date -Format o)"; Body = '<p>automated test</p>'; Category = 'Discussion' } `
    @{ 'X-RequestDigest' = $d; Accept = 'application/json;odata=verbose' }

  if ($add.Ok) {
    $new = ($add.Content | ConvertFrom-Json -AsHashtable).d
    $newId = $new.Id
    $status = $new.OData__ModerationStatus
    Check "new post lands as Pending (status 2), not Approved" ($status -eq 2) "OData__ModerationStatus=$status"

    # --- requirement 13: only Super Admin may delete.
    # Assert the item SURVIVES rather than asserting a status code: on-prem
    # NTLM answers an access-denied DELETE with 401, not the 403 you would get
    # from SharePoint Online, so the status alone is not a reliable signal.
    $del = Call $c "/web/lists/getbytitle('DiscussionPosts')/items($newId)" 'Post' $null `
      @{ 'X-RequestDigest' = $d; 'X-HTTP-Method' = 'DELETE'; 'IF-MATCH' = '*' }
    $still = Call $c "/web/lists/getbytitle('DiscussionPosts')/items($newId)?`$select=Id"
    Check "DELETE is refused and the post survives" ((-not $del.Ok) -and $still.Ok) `
      "delete status $($del.Status); item still readable = $($still.Ok)"

    $script:leftovers += $newId
  } else {
    Check "can submit a post" $false "status $($add.Status) -- $($add.Content)"
  }

  # --- likes must not touch the post item (that would reset it to Pending)
  $ld = Call $c "/web/lists/getbytitle('DiscussionLikes')/items" 'Post' `
    @{ __metadata = @{ type = 'SP.Data.DiscussionLikesListItem' }; Title = 'test'; PostId = 1 } `
    @{ 'X-RequestDigest' = $d; Accept = 'application/json;odata=verbose' }
  Check "can add a row to DiscussionLikes" ($ld.Ok) "status $($ld.Status) -- $($ld.Content)"
}

# The test accounts cannot delete their own test posts -- that is the point of
# requirement 13 -- so clean up as System Account, which can.
if ($leftovers.Count) {
  Write-Host "`nCleaning up test posts: $($leftovers -join ', ')" -ForegroundColor Cyan
  Import-Module (Join-Path $PSScriptRoot 'SPRest.psm1') -Force
  Connect-SPRest -SiteUrl $SiteUrl
  foreach ($id in $leftovers) {
    try { Invoke-SPDelete "/web/lists/getbytitle('DiscussionPosts')/items($id)"; Write-Host "  removed $id" -ForegroundColor DarkGray }
    catch { Write-Host "  could not remove $id -- $($_.Exception.Message)" -ForegroundColor Yellow }
  }
}

Write-Host "`n$pass passed, $fail failed." -ForegroundColor $(if ($fail) { 'Red' } else { 'Green' })
exit $(if ($fail) { 1 } else { 0 })
