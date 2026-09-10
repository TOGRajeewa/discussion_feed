<#
  End-to-end walk through the change request, as real users.

  A post is submitted by an ordinary user in Communications, checked for
  invisibility, routed to the Communications department admin (and NOT to the
  Bank Supervision one), approved, and then checked for visibility. Finally the
  delete restriction is confirmed against both an approver and a Super Admin.

  Covers requirements 1-7, 12, 13 in one pass.

    .\Test-ModerationFlow.ps1 -SiteUrl "http://124.43.17.138:9371"
#>
param(
  [Parameter(Mandatory = $true)] [string] $SiteUrl,
  [string] $Domain = 'ad-him',
  # A member of the site owners group. Supply the password to exercise Super
  # Admin delete for real; without it the script falls back to asserting the
  # permission grant, which is weaker.
  [string] $SuperAdminUser = 'superadmin',
  [string] $SuperAdminPassword
)

$ErrorActionPreference = 'Continue'
$SiteUrl = $SiteUrl.TrimEnd('/')
$POSTS = "/web/lists/getbytitle('DiscussionPosts')"

$pass = 0; $fail = 0
function Check([string] $desc, [bool] $ok, [string] $detail) {
  if ($ok) { $script:pass++; Write-Host "  PASS  $desc" -ForegroundColor Green }
  else     { $script:fail++; Write-Host "  FAIL  $desc" -ForegroundColor Red; Write-Host "        $detail" -ForegroundColor DarkGray }
}
function Cred($u, $p) { [pscredential]::new("$Domain\$u", (ConvertTo-SecureString $p -AsPlainText -Force)) }

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

$author     = Cred 'testuser2' 'REDACTED'    # ordinary user, Communications
$commAdmin  = Cred 'commadmin' 'REDACTED'    # Dept Admins - Communications
$otherAdmin = Cred 'spuser'    'REDACTED'   # Dept Admins - Bank Supervision
$contentAdmin = Cred 'spadmin' 'REDACTED'   # Content Admin — NOT a site owner
$superAdmin = if ($SuperAdminPassword) { Cred $SuperAdminUser $SuperAdminPassword } else { $null }

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
$asOther = Req (Cred 'testuser3' 'REDACTED') "$POSTS/items?`$filter=Id eq $postId"
Check "another ordinary user cannot read it" ($asOther.Ok -and $asOther.Data.value.Count -eq 0) `
  "returned $($asOther.Data.value.Count) row(s)"

$feed = Req (Cred 'testuser3' 'REDACTED') "$POSTS/items?`$filter=OData__ModerationStatus eq 0&`$top=200"
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
$stillHidden = Req (Cred 'testuser3' 'REDACTED') "$POSTS/items?`$filter=Id eq $postId"
Check "self-approval does not publish the post" ($stillHidden.Data.value.Count -eq 0) `
  "self-approve returned $($selfApprove.Status); post is now visible to others"

# --- 5. approve ------------------------------------------------------------
Write-Host "`n[5] the department admin approves it" -ForegroundColor Cyan
$d3 = Digest $commAdmin
$ap = Req $commAdmin "$POSTS/items($postId)" 'Post' @{
  __metadata = @{ type = 'SP.Data.DiscussionPostsListItem' }; OData__ModerationStatus = 0
} @{ 'X-RequestDigest' = $d3; 'X-HTTP-Method' = 'MERGE'; 'IF-MATCH' = '*' }
Check "approve succeeds" $ap.Ok "status $($ap.Status) $($ap.Err)"

$after = Req (Cred 'testuser3' 'REDACTED') "$POSTS/items?`$filter=Id eq $postId&`$select=Id,OData__ModerationStatus"
Check "the approved post is now visible to other users" ($after.Data.value.Count -eq 1) `
  "returned $($after.Data.value.Count) row(s)"

# --- 6. liking must not unpublish -----------------------------------------
Write-Host "`n[6] liking an approved post must not send it back to Pending" -ForegroundColor Cyan
$d4 = Digest (Cred 'testuser3' 'REDACTED')
$like = Req (Cred 'testuser3' 'REDACTED') "/web/lists/getbytitle('DiscussionLikes')/items" 'Post' @{
  __metadata = @{ type = 'SP.Data.DiscussionLikesListItem' }; Title = "Post $postId"; PostId = $postId
} @{ 'X-RequestDigest' = $d4 }
Check "like recorded" $like.Ok "status $($like.Status)"
$stillUp = Req (Cred 'testuser3' 'REDACTED') "$POSTS/items?`$filter=Id eq $postId and OData__ModerationStatus eq 0"
Check "post is still Approved after being liked" ($stillUp.Data.value.Count -eq 1) `
  "the post left the feed -- likes are writing to the post item again"
if ($like.Ok) {
  $ld = Digest (Cred 'testuser3' 'REDACTED')
  Req (Cred 'testuser3' 'REDACTED') "/web/lists/getbytitle('DiscussionLikes')/items($($like.Data.Id))" 'Post' $null `
    @{ 'X-RequestDigest' = $ld; 'X-HTTP-Method' = 'DELETE'; 'IF-MATCH' = '*' } | Out-Null
}

# --- 7. delete restriction -------------------------------------------------
Write-Host "`n[7] only a Super Admin may delete" -ForegroundColor Cyan
$d5 = Digest $commAdmin
Req $commAdmin "$POSTS/items($postId)" 'Post' $null `
  @{ 'X-RequestDigest' = $d5; 'X-HTTP-Method' = 'DELETE'; 'IF-MATCH' = '*' } | Out-Null
$survived = Req $commAdmin "$POSTS/items?`$filter=Id eq $postId"
Check "department admin cannot delete" ($survived.Data.value.Count -eq 1) "the post was deleted by a non-Super-Admin"

# spadmin is in "Content Admin", not in the site owners group, so it must be
# refused too -- Super Admin means the owners group and nothing else.
$d6 = Digest $contentAdmin
Req $contentAdmin "$POSTS/items($postId)" 'Post' $null `
  @{ 'X-RequestDigest' = $d6; 'X-HTTP-Method' = 'DELETE'; 'IF-MATCH' = '*' } | Out-Null
$survived2 = Req $commAdmin "$POSTS/items?`$filter=Id eq $postId"
Check "a non-owner admin account cannot delete either" ($survived2.Data.value.Count -eq 1) `
  "the post was deleted by an account outside the site owners group"

Import-Module (Join-Path $PSScriptRoot 'SPRest.psm1') -Force
Connect-SPRest -SiteUrl $SiteUrl
$owner = (Invoke-SPGet '/web?$expand=AssociatedOwnerGroup').AssociatedOwnerGroup

if ($superAdmin) {
  # The account must be a group member but NOT a site collection admin, or the
  # delete would prove nothing about the permission model.
  $enc = [uri]::EscapeDataString("i:0#.w|$Domain\$SuperAdminUser")
  $su = Invoke-SPGet "/web/siteusers/getbyloginname(@v)?@v='$enc'"
  $suGroups = (Invoke-SPGet "/web/siteusers/getbyid($($su.Id))/groups?`$select=Title").value
  Check "$SuperAdminUser is in '$($owner.Title)'" `
    ((($suGroups | ForEach-Object { $_.Title }) -contains $owner.Title)) "groups: $(($suGroups | ForEach-Object { $_.Title }) -join ', ')"
  Check "$SuperAdminUser is NOT a site collection admin" (-not $su.IsSiteAdmin) `
    "IsSiteAdmin=$($su.IsSiteAdmin) — a delete by it would prove nothing"

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
  # Fall back to asserting the grant, which is weaker than exercising it.
  $ras = (Invoke-SPGet "$POSTS/roleassignments?`$expand=Member,RoleDefinitionBindings&`$top=200").value
  $ownerRa = $ras | Where-Object { $_.Member.Id -eq $owner.Id } | Select-Object -First 1
  $mask = if ($ownerRa) { [int64]($ownerRa.RoleDefinitionBindings | Select-Object -First 1).BasePermissions.Low } else { 0 }
  Check "site owners group '$($owner.Title)' holds Delete Items on DiscussionPosts" `
    (($mask -band 8) -ne 0) "permission mask Low=$mask"
  Write-Host "  NOTE: Super Admin delete asserted from the permission grant, not exercised." -ForegroundColor Yellow
  Write-Host "        Re-run with -SuperAdminPassword to test it for real." -ForegroundColor Yellow
}

# Clean up whatever survived, as System Account.
$left = (Invoke-SPGet "$POSTS/items?`$filter=Id eq $postId&`$select=Id" -AsHashtable).value
if ($left.Count -gt 0) {
  try { Invoke-SPDelete "$POSTS/items($postId)"; Write-Host "  cleaned up test post $postId" -ForegroundColor DarkGray }
  catch { Write-Host "  could not clean up post $postId" -ForegroundColor Yellow }
}

Write-Host "`n$pass passed, $fail failed." -ForegroundColor $(if ($fail) { 'Red' } else { 'Green' })
exit $(if ($fail) { 1 } else { 0 })
