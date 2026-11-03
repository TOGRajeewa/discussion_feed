<#
  Repairs MarketplaceComments.PostLookup when it points at a list that no longer
  exists -- because MarketplacePosts was deleted and created again, say, or the
  comments list was copied from another farm. Provision-Marketplace.ps1 leaves
  an existing column alone, so re-running it does not fix this.

  The symptom: Market Place cards show 0 comments, yet the comments appear when
  a card is expanded. Reading PostLookupId goes through the lookup's target
  list, so with that list gone it comes back empty on every row and the widget
  counts nothing. Filtering on it uses the number stored on the row, so the
  comments themselves still load, and new ones still save.

  Only the column's target list changes; the post id stored on each comment is
  not written. Those ids cannot be read while the lookup is broken, so each
  comment's post is first worked out through the filter, then compared with
  what the column returns afterwards.

  It stops without changing anything if the column points at a list that still
  exists: that is not this fault, and needs a person to look at it.

  Idempotent -- safe to re-run. -DryRun prints the plan and changes nothing.

  Runs in Windows PowerShell 5.1 or PowerShell 7, as a Site Collection Administrator.

    .\Repair-MarketplaceLookup.ps1 -SiteUrl "https://mansaladev.cbsl.lk" -DryRun
    .\Repair-MarketplaceLookup.ps1 -SiteUrl "https://mansaladev.cbsl.lk"
#>
#Requires -Version 5.1
param(
  [Parameter(Mandatory = $true)] [string] $SiteUrl,
  [pscredential] $Credential,
  [string] $PostsListTitle = 'MarketplacePosts',
  [string] $CommentsListTitle = 'MarketplaceComments',
  [switch] $DryRun
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'SPRest.psm1') -Force

Connect-SPRest -SiteUrl $SiteUrl -Credential $Credential
if ($DryRun) { Write-Host "DRY RUN - nothing will be changed`n" -ForegroundColor Magenta }

# The Market Place lists give everyone but site collection administrators
# Contribute only, which does not allow changing a column.
$runner = Invoke-SPGet '/web/currentuser?$select=Title,IsSiteAdmin'
if (-not $runner.IsSiteAdmin) {
  $msg = "$($runner.Title) is not a Site Collection Administrator. Run this as one " +
         "(Site settings > Site collection administrators), or pass -Credential for such an account."
  if ($DryRun) { Write-Host "  WARNING: $msg" -ForegroundColor Yellow } else { throw $msg }
}

$fieldPath = "/web/lists/getbytitle('$CommentsListTitle')/fields/getbyinternalnameortitle('PostLookup')"
$itemsPath = "/web/lists/getbytitle('$CommentsListTitle')/items"

function Get-LookupSchema { (Invoke-SPGet "${fieldPath}?`$select=SchemaXml").SchemaXml }

function Get-AllRows([string] $Path) {
  $rows = [System.Collections.Generic.List[object]]::new()
  $page = Invoke-SPGet $Path -AsHashtable
  while ($page) {
    foreach ($row in @($page.value)) { $rows.Add($row) }
    $next = $page['odata.nextLink']
    $page = if ($next) { Invoke-SPGet $next -AsHashtable } else { $null }
  }
  return ,$rows
}

# -------------------------------------------------------------- 1. the column --
Write-Host "`n[1/4] Where the column points" -ForegroundColor Cyan

$postsId = (Invoke-SPGet "/web/lists/getbytitle('$PostsListTitle')?`$select=Id").Id
$schema = Get-LookupSchema
$target = [regex]::Match($schema, '\bList="\{?([0-9a-fA-F-]{36})\}?"')
if (-not $target.Success) { throw "$CommentsListTitle.PostLookup names no target list: $schema" }
$currentId = $target.Groups[1].Value

Write-Host "  $PostsListTitle is list  $postsId"
Write-Host "  PostLookup points at     $currentId"

if ($currentId -eq $postsId) {
  Write-Host "`nNothing to do: PostLookup already points at $PostsListTitle." -ForegroundColor Green
  exit 0
}

$other = $null
try {
  $other = Invoke-SPGet "/web/lists(guid'$currentId')?`$select=Title"
} catch {
  if ($_.Exception.Message -notmatch 'failed\. 404 ') { throw }
}
if ($other) {
  throw ("PostLookup points at the list '$($other.Title)', which still exists, so its target is not missing. " +
         "Nothing was changed. Check by hand which list these comments belong to.")
}
Write-Host "  That list does not exist." -ForegroundColor Yellow

# ------------------------------------------------- 2. which post, per comment --
Write-Host "`n[2/4] Comments, by the post id stored on each" -ForegroundColor Cyan

$postIds = @(foreach ($row in (Get-AllRows "/web/lists/getbytitle('$PostsListTitle')/items?`$select=Id&`$top=5000")) { [int]$row.Id })
$total = (Get-AllRows "${itemsPath}?`$select=Id&`$top=5000").Count

$postOf = @{}
foreach ($postId in $postIds) {
  foreach ($row in (Get-AllRows "${itemsPath}?`$select=Id&`$filter=PostLookupId eq $postId&`$top=5000")) {
    $postOf[[int]$row.Id] = $postId
  }
}
$withoutPost = $total - $postOf.Count
Write-Host "  $total comment(s): $($postOf.Count) on the $($postIds.Count) current post(s), $withoutPost on posts that no longer exist."

# ----------------------------------------------------------------- 3. repoint --
Write-Host "`n[3/4] Point the column at $PostsListTitle" -ForegroundColor Cyan

if ($DryRun) {
  Write-Host "  Would change List=`"{$currentId}`" to List=`"{$postsId}`"." -ForegroundColor Yellow
  Write-Host "`nDRY RUN: 1 change planned. Run again without -DryRun to apply." -ForegroundColor Magenta
  exit 0
}

Write-Host "  Previous definition, for the record:" -ForegroundColor DarkGray
Write-Host "  $schema" -ForegroundColor DarkGray
Invoke-SPPost $fieldPath @{
  __metadata = @{ type = 'SP.FieldLookup' }
  SchemaXml  = $schema.Replace($target.Value, "List=`"{$postsId}`"")
} -Merge | Out-Null
Write-Host "  Changed." -ForegroundColor Yellow

# ------------------------------------------------------------------ 4. verify --
Write-Host "`n[4/4] Every comment still on its own post" -ForegroundColor Cyan

if ((Get-LookupSchema) -notmatch $postsId) { throw "SharePoint accepted the change, but PostLookup still does not point at $PostsListTitle." }

$rows = Get-AllRows "${itemsPath}?`$select=Id,PostLookupId&`$top=5000"
$wrong = 0
$perPost = @{}
foreach ($row in $rows) {
  $expected = $postOf[[int]$row.Id]
  if ($null -eq $expected) { continue }
  if ($row.PostLookupId -ne $expected) {
    $wrong++
    Write-Host "  comment $($row.Id): expected post $expected, read '$($row.PostLookupId)'" -ForegroundColor Red
  }
  $perPost[$expected] = 1 + [int]$perPost[$expected]
}
foreach ($postId in $postIds) {
  if ($perPost[$postId]) { Write-Host "  post ${postId}: $($perPost[$postId]) comment(s)" }
}

Write-Host ''
if ($rows.Count -ne $total -or $wrong -gt 0) {
  Write-Host "Repair NOT verified: $wrong comment(s) read back wrong; $total rows before, $($rows.Count) after." -ForegroundColor Red
  exit 1
}
Write-Host 'Done: PostLookup repaired. Reload the Market Place to see the comment counts.' -ForegroundColor Green
