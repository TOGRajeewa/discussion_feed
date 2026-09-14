<#
  Reverses Provision-Moderation.ps1, returning the feed to its pre-moderation
  behaviour: every post visible to everyone, no approval step, delete governed
  by the site's normal permissions.

  READ THIS BEFORE RUNNING IN A LIVE ENVIRONMENT
  ----------------------------------------------
  Turning content approval off makes every Pending and Rejected post visible to
  all staff immediately -- including anything a moderator rejected as
  inappropriate, which is the exact content the change request exists to keep
  hidden. The script refuses to proceed while such posts exist unless you say
  what to do with them:

    -PendingAction Report   (default) list them and stop
    -PendingAction Delete   remove Pending and Rejected posts, then roll back
    -PendingAction Publish  approve them all, then roll back (rarely what you want)

  What it does NOT do, deliberately:
    * does not delete the Department / DepartmentId columns (data)
    * does not delete DiscussionLikes (data)
  Both are harmless to leave in place, and dropping them loses information.

  Likes: -RestoreLikes copies DiscussionLikes rows back into the post items'
  Likes column, which the pre-change bundle reads. Without it, rolling the
  bundle back to a pre-moderation build shows every post with zero likes.

    .\Rollback-Moderation.ps1 -SiteUrl "http://..." -DryRun
    .\Rollback-Moderation.ps1 -SiteUrl "http://..." -PendingAction Delete -RestoreLikes
#>
#Requires -Version 7.0
param(
  [Parameter(Mandatory = $true)] [string] $SiteUrl,
  [pscredential] $Credential,
  [ValidateSet('Report', 'Delete', 'Publish')] [string] $PendingAction = 'Report',
  [switch] $RestoreLikes,
  [switch] $DryRun
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'SPRest.psm1') -Force

function Step($m) { Write-Host "  $m" -ForegroundColor Yellow }
function Skip($m) { Write-Host "  - $m" -ForegroundColor DarkGray }

Connect-SPRest -SiteUrl $SiteUrl -Credential $Credential
if ($DryRun) { Write-Host "DRY RUN - nothing will be changed`n" -ForegroundColor Magenta }

$posts = Invoke-SPGet "/web/lists/getbytitle('DiscussionPosts')?`$select=Id,Title,EnableModeration,DraftVersionVisibility"

# ------------------------------------------------- 1. unapproved content ----
Write-Host "`n[1/5] Pending and rejected posts" -ForegroundColor Cyan

$unapproved = @()
if ($posts.EnableModeration) {
  $unapproved = (Invoke-SPGet ("/web/lists/getbytitle('DiscussionPosts')/items" +
    "?`$select=Id,Title,OData__ModerationStatus&`$filter=OData__ModerationStatus ne 0&`$top=2000") -AsHashtable).value
}

if ($unapproved.Count -eq 0) {
  Skip 'none — safe to disable content approval'
} else {
  Write-Host "  $($unapproved.Count) post(s) are not approved:" -ForegroundColor Yellow
  foreach ($p in $unapproved) {
    $state = if ($p.OData__ModerationStatus -eq 2) { 'Pending' } else { 'Rejected' }
    Write-Host ("    {0,-5} {1,-9} {2}" -f $p.Id, $state, ($p.Title -replace '\s+', ' ')) -ForegroundColor DarkGray
  }
  if ($PendingAction -eq 'Report') {
    Write-Host "`n  STOPPING. Disabling content approval would publish all of the above to" -ForegroundColor Red
    Write-Host "  every member of staff, rejected items included. Re-run with" -ForegroundColor Red
    Write-Host "  -PendingAction Delete (or Publish) once you have decided." -ForegroundColor Red
    exit 2
  }
  foreach ($p in $unapproved) {
    if ($PendingAction -eq 'Delete') {
      Step "delete post $($p.Id)"
      if (-not $DryRun) { Invoke-SPDelete "/web/lists/getbytitle('DiscussionPosts')/items($($p.Id))" }
    } else {
      Step "approve post $($p.Id)"
      if (-not $DryRun) {
        Invoke-SPPost "/web/lists/getbytitle('DiscussionPosts')/items($($p.Id))" @{
          __metadata = @{ type = 'SP.Data.DiscussionPostsListItem' }; OData__ModerationStatus = 0
        } -Merge | Out-Null
      }
    }
  }
}

# --------------------------------------------- 2. content approval off ------
Write-Host "`n[2/5] Content approval" -ForegroundColor Cyan

if (-not $posts.EnableModeration) {
  Skip 'already disabled'
} else {
  Step 'EnableModeration=false, DraftVersionVisibility=0 (any reader)'
  if (-not $DryRun) {
    Invoke-SPPost "/web/lists/getbytitle('DiscussionPosts')" @{
      __metadata             = @{ type = 'SP.List' }
      EnableModeration       = $false
      DraftVersionVisibility = 0
    } -Merge | Out-Null
  }
}

# ------------------------------------------------------- 3. likes back ------
# Must run AFTER content approval is switched off. Writing to an item while
# moderation is on flags it Pending -- observed even for System Account, a site
# collection administrator -- so restoring likes first would silently
# unpublish every post that had one.
Write-Host "`n[3/5] Likes" -ForegroundColor Cyan

if (-not $RestoreLikes) {
  Skip 'left in DiscussionLikes (-RestoreLikes copies them back onto the posts)'
} else {
  $likes = $null
  try { $likes = Invoke-SPGet "/web/lists/getbytitle('DiscussionLikes')?`$select=Id" } catch { }
  if (-not $likes) {
    Skip 'DiscussionLikes does not exist'
  } else {
    $rows = (Invoke-SPGet "/web/lists/getbytitle('DiscussionLikes')/items?`$select=PostId,LikedById,AuthorId&`$top=5000" -AsHashtable).value
    $byPost = @{}
    foreach ($r in $rows) {
      $uid = if ($r.LikedById) { $r.LikedById } else { $r.AuthorId }
      if (-not $uid -or -not $r.PostId) { continue }
      if (-not $byPost.ContainsKey($r.PostId)) { $byPost[$r.PostId] = @() }
      if ($byPost[$r.PostId] -notcontains $uid) { $byPost[$r.PostId] += $uid }
    }
    Step "copy $($rows.Count) like(s) across $($byPost.Keys.Count) post(s) back onto the items"
    if (-not $DryRun) {
      foreach ($postId in $byPost.Keys) {
        Invoke-SPPost "/web/lists/getbytitle('DiscussionPosts')/items($postId)" @{
          __metadata = @{ type = 'SP.Data.DiscussionPostsListItem' }
          LikesId    = @{ results = @($byPost[$postId]) }
        } -Merge | Out-Null
      }
    }
  }
}

# ------------------------------------------------ 4. permissions back -------
Write-Host "`n[4/5] List permissions" -ForegroundColor Cyan

foreach ($title in 'DiscussionPosts', 'DiscussionComments', 'DiscussionLikes') {
  $l = $null
  try { $l = Invoke-SPGet "/web/lists/getbytitle('$title')?`$select=Id,Title,HasUniqueRoleAssignments" } catch { }
  if (-not $l) { Skip "$title does not exist"; continue }
  if (-not $l.HasUniqueRoleAssignments) { Skip "$title already inherits"; continue }
  Step "$title -> restore permission inheritance from the site"
  if (-not $DryRun) {
    Invoke-SPPost "/web/lists(guid'$($l.Id)')/resetroleinheritance" | Out-Null
  }
}

# ------------------------------------------ 5. custom permission levels -----
Write-Host "`n[5/5] Custom permission levels" -ForegroundColor Cyan

# Removed only when nothing references them, so a rollback on one site cannot
# break another list that is still using them.
$defs = (Invoke-SPGet '/web/roledefinitions?$select=Id,Name&$top=200').value
foreach ($name in 'Feed Contribute', 'Feed Approve') {
  $def = $defs | Where-Object { $_.Name -eq $name } | Select-Object -First 1
  if (-not $def) { Skip "'$name' not present"; continue }
  Step "delete permission level '$name'"
  if (-not $DryRun) {
    try { Invoke-SPDelete "/web/roledefinitions($($def.Id))" }
    catch { Write-Host "    still in use elsewhere; left in place" -ForegroundColor DarkGray }
  }
}

Write-Host "`nRollback complete." -ForegroundColor Green
Write-Host "Department / DepartmentId columns and the DiscussionLikes list were left in" -ForegroundColor DarkGray
Write-Host "place on purpose -- they hold data and are harmless when unused." -ForegroundColor DarkGray
if ($DryRun) { Write-Host "Re-run without -DryRun to apply." -ForegroundColor Magenta }
