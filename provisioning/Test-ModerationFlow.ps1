<#
  End-to-end walk through the change request, as real users.

  A post is submitted by an ordinary user in Communications, checked for
  invisibility, routed to the Communications department admin (and NOT to the
  Bank Supervision one), approved, and then checked for visibility. Finally the
  delete restriction is confirmed against both an approver and a Super Admin.

  Covers requirements 1-7, 12, 13 in one pass.

    .\Test-ModerationFlow.ps1 -SiteUrl "http://124.43.17.138:9371"
#>
#Requires -Version 7.0
param(
  [Parameter(Mandatory = $true)] [string] $SiteUrl,
  # Admin account for cleanup and permission checks; defaults to the signed-in user.
  [pscredential] $Credential,
  [string] $Domain = 'ad-him',
  # A Site Collection Administrator (the Super Admin). With its password
  # available the script exercises Super Admin delete for real.
  [string] $SuperAdminUser = 'superadmin',
  # A second ORDINARY user (no "Dept Admins - …" group, not a site collection
  # admin) used to confirm pending posts are invisible. An approver can see
  # every pending post, so using one here fails the invisibility checks.
  [string] $ObserverUser = 'testuser3'
)

$ErrorActionPreference = 'Continue'
$SiteUrl = $SiteUrl.TrimEnd('/')
$POSTS = "/web/lists/getbytitle('DiscussionPosts')"

$pass = 0; $fail = 0
function Check([string] $desc, [bool] $ok, [string] $detail) {
  if ($ok) { $script:pass++; Write-Host "  PASS  $desc" -ForegroundColor Green }
  else     { $script:fail++; Write-Host "  FAIL  $desc" -ForegroundColor Red; Write-Host "        $detail" -ForegroundColor DarkGray }
}
Import-Module (Join-Path $PSScriptRoot 'TestAccounts.psm1') -Force
function Cred($u) { Get-TestCredential -User $u -Domain $Domain }

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

$author     = Cred 'testuser2'    # ordinary user, Communications
$commAdmin  = Cred 'commadmin'    # Dept Admins - Communications
$otherAdmin = Cred 'spuser'   # Dept Admins - Bank Supervision
$contentAdmin = Cred 'spadmin'   # Content Admin — NOT a site owner
$superAdmin = if (Test-TestCredential -User $SuperAdminUser) { Cred $SuperAdminUser } else { $null }

# The invisibility checks need an observer who is NOT an approver: approvers
# (department admins, site collection admins) can see every pending post by
# design. Skip those checks, rather than fail them, when the observer is one.
$obsMe = (Req (Cred $ObserverUser) '/web/currentuser?$select=IsSiteAdmin').Data
$obsGroups = @((Req (Cred $ObserverUser) '/web/currentuser/groups?$select=Title').Data.value | ForEach-Object { $_.Title })
$observerIsApprover = [bool]$obsMe.IsSiteAdmin -or [bool]($obsGroups | Where-Object { $_ -like 'Dept Admins - *' })
$skipped = 0
function CheckObserver([string] $desc, [bool] $ok, [string] $detail) {
  if ($observerIsApprover) {
    $script:skipped++
    Write-Host "  SKIP  $desc" -ForegroundColor Yellow
    Write-Host "        '$ObserverUser' is an approver, so it can see pending posts. Pass -ObserverUser <an ordinary user>." -ForegroundColor DarkGray
  } else { Check $desc $ok $detail }
}

# The department the post should be routed to, resolved the way the widget does.
$depts = (Req $author "/web/lists/getbytitle('Departments')/items?`$select=Id,Title&`$top=500").Data.value
$comms = $depts | Where-Object { $_.Title -eq 'Communications' } | Select-Object -First 1
if (-not $comms) { Write-Host "Communications department not found; cannot run." -ForegroundColor Red; exit 1 }
Write-Host "Routing to '$($comms.Title)' (id $($comms.Id))`n" -ForegroundColor Cyan

# --- 1. submit -------------------------------------------------------------
Write-Host "[1] testuser2 submits a post" -ForegroundColor Cyan
$marker = "flow test $([guid]::NewGuid().ToString('N').Substring(0,8))"
$d = Digest $author
$add = Req $author "$POSTS/items" 'Post' @{
  __metadata = @{ type = 'SP.Data.DiscussionPostsListItem' }
  Title = $marker; Body = "<p>$marker</p>"; Category = 'Discussion'
  Department = $comms.Title; DepartmentId = $comms.Id
} @{ 'X-RequestDigest' = $d }

if (-not $add.Ok) { Check "post submitted" $false "status $($add.Status) $($add.Err)"; exit 1 }
$postId = $add.Data.Id
Check "post submitted (id $postId)" $true ''
Check "lands as Pending, not Approved" ($add.Data.OData__ModerationStatus -eq 2) "status=$($add.Data.OData__ModerationStatus)"
Check "department stamped on the item" ($add.Data.DepartmentId -eq $comms.Id) "DepartmentId=$($add.Data.DepartmentId)"

# --- 2. invisibility -------------------------------------------------------
Write-Host "`n[2] the pending post must not be visible to other users" -ForegroundColor Cyan
$asOther = Req (Cred $ObserverUser) "$POSTS/items?`$filter=Id eq $postId"
CheckObserver "another ordinary user cannot read it" ($asOther.Ok -and $asOther.Data.value.Count -eq 0) `
  "returned $($asOther.Data.value.Count) row(s)"

$feed = Req (Cred $ObserverUser) "$POSTS/items?`$filter=OData__ModerationStatus eq 0&`$top=200"
$inFeed = @($feed.Data.value | Where-Object { $_.Id -eq $postId }).Count
Check "it is absent from the approved feed" ($inFeed -eq 0) "found $inFeed"

# --- 3. routing ------------------------------------------------------------
Write-Host "`n[3] it reaches the right department admin's queue" -ForegroundColor Cyan
$q = "$POSTS/items?`$filter=OData__ModerationStatus eq 2 and DepartmentId eq $($comms.Id)&`$top=200"
$commQueue = Req $commAdmin $q
$seen = @($commQueue.Data.value | Where-Object { $_.Id -eq $postId }).Count
Check "Communications admin sees it" ($commQueue.Ok -and $seen -eq 1) "status $($commQueue.Status), found $seen"

# The Bank Supervision admin's queue is scoped to their own departments, so the
# post must not appear there. (Approve Items is list-level, so this is the
# widget's scoping, not a SharePoint boundary -- worth asserting all the same.)
$bs = $depts | Where-Object { $_.Title -eq 'Bank Supervision' } | Select-Object -First 1
$otherQueue = Req $otherAdmin "$POSTS/items?`$filter=OData__ModerationStatus eq 2 and DepartmentId eq $($bs.Id)&`$top=200"
$leak = @($otherQueue.Data.value | Where-Object { $_.Id -eq $postId }).Count
Check "Bank Supervision admin's queue does not contain it" ($leak -eq 0) "found $leak"

# --- 4. author cannot self-publish ----------------------------------------
Write-Host "`n[4] the author cannot publish it themselves" -ForegroundColor Cyan
$d2 = Digest $author
$selfApprove = Req $author "$POSTS/items($postId)" 'Post' @{
  __metadata = @{ type = 'SP.Data.DiscussionPostsListItem' }; OData__ModerationStatus = 0
} @{ 'X-RequestDigest' = $d2; 'X-HTTP-Method' = 'MERGE'; 'IF-MATCH' = '*' }
$stillHidden = Req (Cred $ObserverUser) "$POSTS/items?`$filter=Id eq $postId"
CheckObserver "self-approval does not publish the post" ($stillHidden.Data.value.Count -eq 0) `
  "self-approve returned $($selfApprove.Status); post is now visible to others"

# --- 5. approve ------------------------------------------------------------
Write-Host "`n[5] the department admin approves it" -ForegroundColor Cyan
$d3 = Digest $commAdmin
$ap = Req $commAdmin "$POSTS/items($postId)" 'Post' @{
  __metadata = @{ type = 'SP.Data.DiscussionPostsListItem' }; OData__ModerationStatus = 0
} @{ 'X-RequestDigest' = $d3; 'X-HTTP-Method' = 'MERGE'; 'IF-MATCH' = '*' }
Check "approve succeeds" $ap.Ok "status $($ap.Status) $($ap.Err)"

$after = Req (Cred $ObserverUser) "$POSTS/items?`$filter=Id eq $postId&`$select=Id,OData__ModerationStatus"
Check "the approved post is now visible to other users" ($after.Data.value.Count -eq 1) `
  "returned $($after.Data.value.Count) row(s)"

# --- 6. liking must not unpublish -----------------------------------------
Write-Host "`n[6] liking an approved post must not send it back to Pending" -ForegroundColor Cyan
$d4 = Digest (Cred $ObserverUser)
$like = Req (Cred $ObserverUser) "/web/lists/getbytitle('DiscussionLikes')/items" 'Post' @{
  __metadata = @{ type = 'SP.Data.DiscussionLikesListItem' }; Title = "Post $postId"; PostId = $postId
} @{ 'X-RequestDigest' = $d4 }
Check "like recorded" $like.Ok "status $($like.Status)"
$stillUp = Req (Cred $ObserverUser) "$POSTS/items?`$filter=Id eq $postId and OData__ModerationStatus eq 0"
Check "post is still Approved after being liked" ($stillUp.Data.value.Count -eq 1) `
  "the post left the feed -- likes are writing to the post item again"
if ($like.Ok) {
  $ld = Digest (Cred $ObserverUser)
  Req (Cred $ObserverUser) "/web/lists/getbytitle('DiscussionLikes')/items($($like.Data.Id))" 'Post' $null `
    @{ 'X-RequestDigest' = $ld; 'X-HTTP-Method' = 'DELETE'; 'IF-MATCH' = '*' } | Out-Null
}

# --- 7. delete restriction -------------------------------------------------
Write-Host "`n[7] only a Super Admin may delete" -ForegroundColor Cyan
$d5 = Digest $commAdmin
Req $commAdmin "$POSTS/items($postId)" 'Post' $null `
  @{ 'X-RequestDigest' = $d5; 'X-HTTP-Method' = 'DELETE'; 'IF-MATCH' = '*' } | Out-Null
$survived = Req $commAdmin "$POSTS/items?`$filter=Id eq $postId"
Check "department admin cannot delete" ($survived.Data.value.Count -eq 1) "the post was deleted by a non-Super-Admin"

# spadmin holds admin-sounding group memberships but is not a site collection
# administrator, so it must be refused too -- Super Admin means exactly that.
$d6 = Digest $contentAdmin
Req $contentAdmin "$POSTS/items($postId)" 'Post' $null `
  @{ 'X-RequestDigest' = $d6; 'X-HTTP-Method' = 'DELETE'; 'IF-MATCH' = '*' } | Out-Null
$survived2 = Req $commAdmin "$POSTS/items?`$filter=Id eq $postId"
Check "a non-Super-Admin admin account cannot delete either" ($survived2.Data.value.Count -eq 1) `
  "the post was deleted by an account that is not a site collection administrator"

Import-Module (Join-Path $PSScriptRoot 'SPRest.psm1') -Force
Connect-SPRest -SiteUrl $SiteUrl -Credential $Credential

# Structural guarantee: nobody holds Delete Items on the feed lists. Site
# collection administrators are exempt from list permissions, so they are then
# the only people who can delete -- the owners group included in "nobody".
foreach ($listTitle in 'DiscussionPosts', 'DiscussionComments') {
  $ras = (Invoke-SPGet "/web/lists/getbytitle('$listTitle')/roleassignments?`$expand=Member,RoleDefinitionBindings&`$top=500").value
  $withDelete = @()
  foreach ($ra in $ras) {
    foreach ($b in @($ra.RoleDefinitionBindings)) {
      if (([int64]$b.BasePermissions.Low -band 8) -ne 0) { $withDelete += "$($ra.Member.Title) ($($b.Name))" }
    }
  }
  Check "no group or user holds Delete Items on $listTitle" ($withDelete.Count -eq 0) `
    "still able to delete: $($withDelete -join ', ')"
}

if ($superAdmin) {
  # Super Admin is defined as a site collection administrator.
  $enc = [uri]::EscapeDataString("i:0#.w|$Domain\$SuperAdminUser")
  $su = Invoke-SPGet "/web/siteusers/getbyloginname(@v)?@v='$enc'"
  Check "$SuperAdminUser is a Site Collection Administrator" ([bool]$su.IsSiteAdmin) `
    "IsSiteAdmin=$($su.IsSiteAdmin) — add it under Site settings > Site collection administrators"

  $d7 = Digest $superAdmin
  $sd = Req $superAdmin "$POSTS/items($postId)" 'Post' $null `
    @{ 'X-RequestDigest' = $d7; 'X-HTTP-Method' = 'DELETE'; 'IF-MATCH' = '*' }
  $gone = Req $commAdmin "$POSTS/items?`$filter=Id eq $postId"
  Check "Super Admin CAN delete" ($gone.Data.value.Count -eq 0) `
    "delete status $($sd.Status); post $postId still present"

  # Comments are Super-Admin-delete-only too (requirements 13, 14).
  $anyComment = (Req $superAdmin "/web/lists/getbytitle('DiscussionComments')/items?`$select=Id&`$top=1").Data.value
  if ($anyComment.Count -gt 0) {
    $cid = $anyComment[0].Id
    $dc = Digest $commAdmin
    Req $commAdmin "/web/lists/getbytitle('DiscussionComments')/items($cid)" 'Post' $null `
      @{ 'X-RequestDigest' = $dc; 'X-HTTP-Method' = 'DELETE'; 'IF-MATCH' = '*' } | Out-Null
    $stillThere = Req $commAdmin "/web/lists/getbytitle('DiscussionComments')/items?`$filter=Id eq $cid"
    Check "department admin cannot delete a comment" ($stillThere.Data.value.Count -eq 1) `
      "comment $cid was deleted by a non-Super-Admin"
  }
} else {
  Write-Host "  NOTE: no password for '$SuperAdminUser' (a site collection administrator), so" -ForegroundColor Yellow
  Write-Host "        Super Admin delete was not exercised. Add it to test-accounts.local.json." -ForegroundColor Yellow
}

# Clean up whatever survived, as System Account.
$left = (Invoke-SPGet "$POSTS/items?`$filter=Id eq $postId&`$select=Id" -AsHashtable).value
if ($left.Count -gt 0) {
  try { Invoke-SPDelete "$POSTS/items($postId)"; Write-Host "  cleaned up test post $postId" -ForegroundColor DarkGray }
  catch { Write-Host "  could not clean up post $postId" -ForegroundColor Yellow }
}

Write-Host "`n$pass passed, $fail failed$(if ($skipped) { ", $skipped skipped" })." -ForegroundColor $(if ($fail) { 'Red' } elseif ($skipped) { 'Yellow' } else { 'Green' })
exit $(if ($fail) { 1 } else { 0 })
