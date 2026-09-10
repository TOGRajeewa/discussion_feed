<#
  Exercises the exact REST shapes FeedService/ModerationService now issue, as
  real users, so a query that only works for a site collection admin cannot
  slip through to the bundle.

  Phase 2 counterpart to Test-Moderation.ps1 (which covers the permissions).

    .\Test-FeedQueries.ps1 -SiteUrl "http://124.43.17.138:9371"
#>
param(
  [Parameter(Mandatory = $true)] [string] $SiteUrl,
  [string] $Domain = 'ad-him'
)

$ErrorActionPreference = 'Continue'
$SiteUrl = $SiteUrl.TrimEnd('/')

$pass = 0; $fail = 0
function Check([string] $desc, [bool] $ok, [string] $detail) {
  if ($ok) { $script:pass++; Write-Host "  PASS  $desc" -ForegroundColor Green }
  else     { $script:fail++; Write-Host "  FAIL  $desc" -ForegroundColor Red; Write-Host "        $detail" -ForegroundColor DarkGray }
}

function Cred($u, $p) { [pscredential]::new("$Domain\$u", (ConvertTo-SecureString $p -AsPlainText -Force)) }

function Get-Json($Cred, [string] $Path) {
  try {
    $r = Invoke-WebRequest -Uri "$SiteUrl/_api$Path" -Headers @{ Accept = 'application/json;odata=nometadata' } `
      -Credential $Cred -AllowUnencryptedAuthentication -ErrorAction Stop
    return @{ Ok = $true; Data = ($r.Content | ConvertFrom-Json -AsHashtable) }
  } catch {
    return @{ Ok = $false; Data = $null; Err = $_.Exception.Message }
  }
}

$plain = Cred 'testuser2' 'REDACTED'
$admin = Cred 'spuser'    'REDACTED'

Write-Host "`n=== FeedService.getPostsFirstPage (as testuser2) ===" -ForegroundColor Cyan
$feed = Get-Json $plain ("/web/lists/getbytitle('DiscussionPosts')/items" +
  "?`$select=Id,Title,Body,Category,Created,Department,DepartmentId,Author/Title,Author/EMail" +
  "&`$expand=Author&`$filter=OData__ModerationStatus eq 0&`$orderby=Created desc&`$top=20")
Check "approved-only feed query succeeds" $feed.Ok $feed.Err
if ($feed.Ok) {
  $ids = @($feed.Data.value | ForEach-Object { $_.Id })
  Write-Host "  returned $($ids.Count) post(s)" -ForegroundColor DarkGray

  # attachEngagement: one likes query and one comments query for the whole page
  if ($ids.Count -gt 0) {
    $orIds = ($ids | ForEach-Object { "PostId eq $_" }) -join ' or '
    $lk = Get-Json $plain ("/web/lists/getbytitle('DiscussionLikes')/items" +
      "?`$select=PostId,LikedBy/Id,Author/Id&`$expand=LikedBy,Author&`$filter=$orIds&`$top=4000")
    Check "batched likes query succeeds" $lk.Ok $lk.Err
    if ($lk.Ok) { Write-Host "  $($lk.Data.value.Count) like row(s)" -ForegroundColor DarkGray }

    $orC = ($ids | ForEach-Object { "PostLookupId eq $_" }) -join ' or '
    $cm = Get-Json $plain ("/web/lists/getbytitle('DiscussionComments')/items" +
      "?`$select=PostLookupId&`$filter=$orC&`$top=4000")
    Check "batched comment-count query succeeds" $cm.Ok $cm.Err
    if ($cm.Ok) { Write-Host "  $($cm.Data.value.Count) comment row(s)" -ForegroundColor DarkGray }
  }
}

Write-Host "`n=== DepartmentService (as testuser2) ===" -ForegroundColor Cyan
$prof = Get-Json $plain '/SP.UserProfiles.PeopleManager/GetMyProperties'
Check "can read own User Profile" $prof.Ok $prof.Err
if ($prof.Ok) {
  $dept = ($prof.Data.UserProfileProperties | Where-Object { $_.Key -eq 'Department' }).Value
  Write-Host "  profile Department = '$dept'" -ForegroundColor DarkGray
  $depts = Get-Json $plain "/web/lists/getbytitle('Departments')/items?`$select=Id,Title&`$orderby=Title&`$top=500"
  Check "can read the Departments list" $depts.Ok $depts.Err
  if ($depts.Ok) {
    $hit = $depts.Data.value | Where-Object { $_.Title -eq $dept }
    Check "profile Department matches a Departments row" ([bool]$hit) "'$dept' did not match any of $($depts.Data.value.Count) titles"
  }
}

Write-Host "`n=== ModerationService.getRole (as spuser) ===" -ForegroundColor Cyan
$g = Get-Json $admin '/web/currentuser/groups?$select=Id,Title&$top=200'
Check "can read own group memberships" $g.Ok $g.Err
if ($g.Ok) {
  $titles = @($g.Data.value | ForEach-Object { $_.Title })
  $deptGroups = @($titles | Where-Object { $_ -like 'Dept Admins - *' })
  Write-Host "  groups: $($titles -join ', ')" -ForegroundColor DarkGray
  Check "resolves at least one 'Dept Admins - *' membership" ($deptGroups.Count -gt 0) "none found"
}
$own = Get-Json $admin '/web?$expand=AssociatedOwnerGroup&$select=Title'
Check "can read the site's owner group name" $own.Ok $own.Err

Write-Host "`n=== ModerationService.getPendingPosts (as spuser) ===" -ForegroundColor Cyan
$pend = Get-Json $admin ("/web/lists/getbytitle('DiscussionPosts')/items" +
  "?`$select=Id,Title,Body,Category,Created,Department,DepartmentId,OData__ModerationStatus,OData__ModerationComments,Author/Title,Author/EMail" +
  "&`$expand=Author&`$filter=OData__ModerationStatus eq 2&`$orderby=Created&`$top=100")
Check "pending-queue query succeeds for an approver" $pend.Ok $pend.Err
if ($pend.Ok) { Write-Host "  $($pend.Data.value.Count) pending post(s)" -ForegroundColor DarkGray }

Write-Host "`n$pass passed, $fail failed." -ForegroundColor $(if ($fail) { 'Red' } else { 'Green' })
exit $(if ($fail) { 1 } else { 0 })
