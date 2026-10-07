<#
  Checks the Market Place rules against a live site, as real users:

    * the three lists exist with no approval, "read all" and "edit/delete own
      items only", and Everyone = Contribute is the only permission;
    * a post is visible to another user as soon as it is saved;
    * another user -- a department admin, and the Content Admin -- cannot edit
      or delete it, nor delete someone else's like or comment;
    * authors can delete their own post, like and comment;
    * "My posts" (AuthorId filter) returns only the caller's posts;
    * a Super Admin can delete anyone's comment and post.

  Everything it creates is deleted again at the end.

    pwsh .\Test-Marketplace.ps1 -SiteUrl "http://124.43.17.138:9371"
#>
#Requires -Version 7.0
param(
  [Parameter(Mandatory = $true)] [string] $SiteUrl,
  [string] $Domain = 'ad-him',
  [string] $AuthorUser = 'testuser2',       # ordinary user
  [string] $OtherUser = 'commadmin',        # department admin: no extra rights here
  [string] $ContentAdminUser = 'spadmin',   # Content Admin, not a site owner
  [string] $SuperAdminUser = 'superadmin'   # site collection administrator
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
function Add($Cred, [string] $List, [hashtable] $Fields) {
  $Fields['__metadata'] = @{ type = $types[$List] }
  Req $Cred "/web/lists/getbytitle('$List')/items" 'Post' $Fields @{ 'X-RequestDigest' = (Digest $Cred) }
}
function Merge($Cred, [string] $List, [int] $Id, [hashtable] $Fields) {
  $Fields['__metadata'] = @{ type = $types[$List] }
  Req $Cred "/web/lists/getbytitle('$List')/items($Id)" 'Post' $Fields @{
    'X-RequestDigest' = (Digest $Cred); 'X-HTTP-Method' = 'MERGE'; 'IF-MATCH' = '*' }
}
function Remove($Cred, [string] $List, [int] $Id) {
  Req $Cred "/web/lists/getbytitle('$List')/items($Id)" 'Post' $null @{
    'X-RequestDigest' = (Digest $Cred); 'X-HTTP-Method' = 'DELETE'; 'IF-MATCH' = '*' }
}
function Why($r) { "status $($r.Status) $($r.Err)" }
# A refusal must be SharePoint saying no (401/403), not some other failure.
function Denied($r) { -not $r.Ok -and $r.Status -in 401, 403 }

$P = 'MarketplacePosts'; $C = 'MarketplaceComments'; $L = 'MarketplaceLikes'
$author = Cred $AuthorUser; $other = Cred $OtherUser
$contentAdmin = Cred $ContentAdminUser; $super = Cred $SuperAdminUser
$marker = "mp-test $(Get-Date -Format 'yyyyMMdd-HHmmss')"

# ---------------------------------------------------------------- set-up --
Write-Host "`nSet-up" -ForegroundColor Cyan
$types = @{}
foreach ($t in $P, $C, $L) {
  $info = (Req $super "/web/lists/getbytitle('$t')?`$select=EnableModeration,ReadSecurity,WriteSecurity,HasUniqueRoleAssignments,ListItemEntityTypeFullName").Data
  Check "$t exists" ([bool]$info) 'run Provision-Marketplace.ps1 first'
  if (-not $info) { continue }
  $types[$t] = $info.ListItemEntityTypeFullName
  Check "$t has no approval" (-not $info.EnableModeration) "EnableModeration=$($info.EnableModeration)"
  Check "${t}: read all, edit/delete own items only" ($info.ReadSecurity -eq 1 -and $info.WriteSecurity -eq 2) "ReadSecurity=$($info.ReadSecurity) WriteSecurity=$($info.WriteSecurity)"
  $ras = (Req $super "/web/lists/getbytitle('$t')/roleassignments?`$expand=Member,RoleDefinitionBindings").Data.value
  $grants = @(foreach ($ra in $ras) { foreach ($b in $ra.RoleDefinitionBindings) {
    if ($b.Name -ne 'Limited Access') { "$($ra.Member.LoginName)=$($b.Name)" } } })
  Check "${t}: Everyone = Contribute is the only permission" `
    ($info.HasUniqueRoleAssignments -and $grants.Count -eq 1 -and $grants[0] -eq 'c:0(.s|true=Contribute') ($grants -join '; ')
}
if ($types.Count -lt 3) { Write-Host "`n$pass passed, $fail failed" -ForegroundColor Red; exit 1 }

$idx = { param($list, $field) [bool](Req $super "/web/lists/getbytitle('$list')/fields/getbyinternalnameortitle('$field')?`$select=Indexed").Data.Indexed }
Check "$P indexed on Created By and Created" ((& $idx $P 'Author') -and (& $idx $P 'Created')) 'needed for "My posts" past 5,000 items'
Check "$C indexed on PostLookup" (& $idx $C 'PostLookup') ''
Check "$L indexed on PostId" (& $idx $L 'PostId') ''

$authorId = (Req $author '/web/currentuser?$select=Id').Data.Id
$otherId  = (Req $other  '/web/currentuser?$select=Id').Data.Id

# ------------------------------------------------------------------ posts --
Write-Host "`nPosts" -ForegroundColor Cyan
$add = Add $author $P @{ Title = $marker; Body = "<p>$marker</p>"; Category = 'Discussion' }
Check "$AuthorUser can post" $add.Ok (Why $add)
$postId = $add.Data.Id

$feed = (Req $other "/web/lists/getbytitle('$P')/items?`$select=Id,AuthorId&`$orderby=Created desc&`$top=20").Data.value
Check "$OtherUser sees the post straight away (no approval)" ([bool]($feed | Where-Object { $_.Id -eq $postId })) 'not in the feed query'

$r = Merge $other $P $postId @{ Title = "$marker (edited by $OtherUser)" }
Check "$OtherUser cannot edit it" (Denied $r) "expected access denied: $(Why $r)"
$r = Remove $other $P $postId
Check "$OtherUser (department admin) cannot delete it" (Denied $r) "expected access denied: $(Why $r)"
$r = Remove $contentAdmin $P $postId
Check "$ContentAdminUser (Content Admin) cannot delete it" (Denied $r) "expected access denied: $(Why $r)"

# ------------------------------------------------------------------ likes --
Write-Host "`nLikes" -ForegroundColor Cyan
$like = Add $other $L @{ Title = "Post $postId"; PostId = $postId }
Check "$OtherUser can like it" $like.Ok (Why $like)
$r = Remove $author $L $like.Data.Id
Check "$AuthorUser cannot remove $OtherUser's like" (Denied $r) "expected access denied: $(Why $r)"
$r = Remove $other $L $like.Data.Id
Check "$OtherUser can remove their own like" $r.Ok (Why $r)

# --------------------------------------------------------------- comments --
Write-Host "`nComments" -ForegroundColor Cyan
$c1 = Add $other $C @{ Title = "$marker comment"; Body = '<p>test comment</p>'; PostLookupId = $postId }
Check "$OtherUser can comment" $c1.Ok (Why $c1)
$r = Remove $author $C $c1.Data.Id
Check "$AuthorUser cannot delete $OtherUser's comment" (Denied $r) "expected access denied: $(Why $r)"
$r = Remove $other $C $c1.Data.Id
Check "$OtherUser can delete their own comment" $r.Ok (Why $r)
$c2 = Add $other $C @{ Title = "$marker comment 2"; Body = '<p>second comment</p>'; PostLookupId = $postId }
$r = Remove $super $C $c2.Data.Id
Check "$SuperAdminUser (Super Admin) can delete anyone's comment" $r.Ok (Why $r)

# --------------------------------------------------------------- my posts --
Write-Host "`nMy posts" -ForegroundColor Cyan
$mine = (Req $author "/web/lists/getbytitle('$P')/items?`$select=Id,AuthorId&`$filter=AuthorId eq $authorId&`$orderby=Created desc&`$top=50").Data.value
Check "$AuthorUser's 'My posts' has the post and only their own" `
  ([bool]($mine | Where-Object { $_.Id -eq $postId }) -and -not ($mine | Where-Object { $_.AuthorId -ne $authorId })) "$(@($mine).Count) rows"
$theirs = (Req $other "/web/lists/getbytitle('$P')/items?`$select=Id&`$filter=AuthorId eq $otherId&`$top=50").Data.value
Check "$OtherUser's 'My posts' does not have it" (-not ($theirs | Where-Object { $_.Id -eq $postId })) ''

# ----------------------------------------------------------------- delete --
Write-Host "`nDelete" -ForegroundColor Cyan
$r = Remove $author $P $postId
Check "$AuthorUser can delete their own post" $r.Ok (Why $r)
$gone = Req $author "/web/lists/getbytitle('$P')/items($postId)"
Check 'the post is gone' (-not $gone.Ok) 'still readable'

$p2 = Add $author $P @{ Title = "$marker (2)"; Body = '<p>second post</p>'; Category = 'Question' }
$r = Remove $super $P $p2.Data.Id
Check "$SuperAdminUser (Super Admin) can delete anyone's post" $r.Ok (Why $r)

# ---------------------------------------------------------------- cleanup --
# Only rows this run created: titles carry its timestamped marker, and likes
# are matched by the post ids it created.
foreach ($t in $P, $C) {
  $left = (Req $super "/web/lists/getbytitle('$t')/items?`$select=Id&`$filter=substringof('$marker',Title)&`$top=100").Data.value
  foreach ($row in @($left)) { Remove $super $t $row.Id | Out-Null }
}
foreach ($id in @($postId, $p2.Data.Id) | Where-Object { $_ }) {
  $left = (Req $super "/web/lists/getbytitle('$L')/items?`$select=Id&`$filter=PostId eq $id&`$top=100").Data.value
  foreach ($row in @($left)) { Remove $super $L $row.Id | Out-Null }
}
Write-Host ''
$colour = if ($fail) { 'Red' } else { 'Green' }
Write-Host "$pass passed, $fail failed" -ForegroundColor $colour
if ($fail) { exit 1 }
