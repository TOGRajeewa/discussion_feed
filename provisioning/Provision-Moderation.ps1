<#
  Phase 1 of the Social Corner & Market Place moderation change request.

  Turns on SharePoint's native content approval for DiscussionPosts and puts
  the supporting permissions in place, so that:

    * a post submitted by a member of staff lands as Pending automatically;
    * Pending/Rejected posts are security-trimmed by SharePoint itself, i.e.
      invisible through REST, list views and search to anyone without the
      Approve Items permission -- not merely hidden by the widget;
    * only Site Collection Administrators (the Super Admins) can delete posts
      or comments -- every other principal, the site owners group included,
      is left without Delete Items on the feed lists;
    * each department's existing "Dept Admins - <name>" group can approve.

  It also creates DiscussionLikes and migrates the existing Likes column into
  it. That move is mandatory, not cosmetic: with content approval on, a write
  to an item by a user WITHOUT Approve Items resets that item to Pending, so
  leaving "like" as an update to the post itself would unpublish the post the
  first time somebody liked it.

  Idempotent -- safe to re-run. Use -DryRun to print the plan and change
  nothing. Undo with Rollback-Moderation.ps1.

  Run with PowerShell 7 (pwsh), not Windows PowerShell 5.1.

    pwsh .\Provision-Moderation.ps1 -SiteUrl "https://mansaladev.cbsl.lk" -DryRun
    pwsh .\Provision-Moderation.ps1 -SiteUrl "https://mansaladev.cbsl.lk"

    # as a specific domain account, when this machine's login is not one the farm accepts
    pwsh .\Provision-Moderation.ps1 -SiteUrl "https://mansaladev.cbsl.lk" -Credential (Get-Credential) -DryRun
#>
#Requires -Version 7.0
param(
  [Parameter(Mandatory = $true)] [string] $SiteUrl,
  [pscredential] $Credential,
  [switch] $DryRun
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'SPRest.psm1') -Force

# SPBasePermissions bits we care about (low dword).
$PERM_DeleteListItems = 8
$PERM_DeleteVersions  = 128

$plan = [System.Collections.Generic.List[string]]::new()
function Step($msg) { $plan.Add($msg); Write-Host ("  " + $msg) -ForegroundColor Yellow }
function Skip($msg) { Write-Host ("  - " + $msg) -ForegroundColor DarkGray }

Connect-SPRest -SiteUrl $SiteUrl -Credential $Credential
if ($DryRun) { Write-Host "DRY RUN - nothing will be changed`n" -ForegroundColor Magenta }

# After step 5 only site collection administrators can manage the feed lists.
# Anyone else running this would lock themselves out mid-way and be unable to
# roll back, so require one up front.
$runner = Invoke-SPGet '/web/currentuser?$select=Title,IsSiteAdmin'
if (-not $runner.IsSiteAdmin) {
  $msg = "$($runner.Title) is not a Site Collection Administrator. Run this as one " +
         "(Site settings > Site collection administrators), or pass -Credential for such an account."
  if ($DryRun) { Write-Host "  WARNING: $msg" -ForegroundColor Yellow } else { throw $msg }
}

# ---------------------------------------------------------------- 1. roles --
# Derive the two custom levels from the stock ones so we inherit whatever the
# farm's definition of Contribute/Approve is, minus the delete rights.
Write-Host "`n[1/6] Permission levels" -ForegroundColor Cyan

$defs = (Invoke-SPGet '/web/roledefinitions?$select=Id,Name,BasePermissions&$top=100').value
function RoleByName($n) { $defs | Where-Object { $_.Name -eq $n } | Select-Object -First 1 }

function Ensure-Role {
  param([string] $Name, [string] $BasedOn, [string] $Description)

  $existing = RoleByName $Name
  $src = RoleByName $BasedOn
  if (-not $src) { throw "Base permission level '$BasedOn' not found on this site." }

  $low = [int64] $src.BasePermissions.Low
  $low = $low -band (-bnot ([int64]$PERM_DeleteListItems))
  $low = $low -band (-bnot ([int64]$PERM_DeleteVersions))

  if ($existing) {
    if ([int64]$existing.BasePermissions.Low -eq $low -and
        [int64]$existing.BasePermissions.High -eq [int64]$src.BasePermissions.High) {
      Skip "'$Name' already exists with the expected mask (id $($existing.Id))"
      return $existing.Id
    }
    Step "update '$Name' -> High=$($src.BasePermissions.High) Low=$low"
    if (-not $DryRun) {
      Invoke-SPPost "/web/roledefinitions($($existing.Id))" @{
        __metadata      = @{ type = 'SP.RoleDefinition' }
        BasePermissions = @{ __metadata = @{ type = 'SP.BasePermissions' }
                             High = "$($src.BasePermissions.High)"; Low = "$low" }
      } -Merge | Out-Null
    }
    return $existing.Id
  }

  Step "create '$Name' from '$BasedOn' minus Delete Items / Delete Versions"
  if ($DryRun) { return -1 }
  $new = Invoke-SPPost '/web/roledefinitions' @{
    __metadata      = @{ type = 'SP.RoleDefinition' }
    Name            = $Name
    Description     = $Description
    Order           = 100
    BasePermissions = @{ __metadata = @{ type = 'SP.BasePermissions' }
                         High = "$($src.BasePermissions.High)"; Low = "$low" }
  }
  return $new.Id
}

$roleContribute = Ensure-Role -Name 'Feed Contribute' -BasedOn 'Contribute' `
  -Description 'Post and comment on the Social Corner feed. Cannot delete.'
$roleApprove = Ensure-Role -Name 'Feed Approve' -BasedOn 'Approve' `
  -Description 'Review and approve Social Corner posts. Cannot delete.'

# --------------------------------------------------------------- 2. fields --
Write-Host "`n[2/6] Columns on DiscussionPosts" -ForegroundColor Cyan

$posts = Invoke-SPGet "/web/lists/getbytitle('DiscussionPosts')?`$select=Id,Title,ItemCount,EnableModeration,DraftVersionVisibility"
$postFields = (Invoke-SPGet "/web/lists(guid'$($posts.Id)')/fields?`$select=InternalName").value.InternalName

function Ensure-Field {
  param([string] $ListId, [string[]] $Existing, [string] $InternalName, [string] $Xml)
  if ($Existing -contains $InternalName) { Skip "column '$InternalName' already present"; return }
  Step "add column '$InternalName'"
  if ($DryRun) { return }
  Invoke-SPPost "/web/lists(guid'$ListId')/fields/createfieldasxml" @{
    parameters = @{
      __metadata = @{ type = 'SP.XmlSchemaFieldCreationInformation' }
      SchemaXml  = $Xml
      Options    = 12   # AddFieldToDefaultView (4) + AddFieldInternalNameHint (8)
    }
  } | Out-Null
}

# Department is stamped at submission time from the author's User Profile, so a
# later profile change cannot re-route a post that is already in a queue.
Ensure-Field $posts.Id $postFields 'Department' `
  '<Field Type="Text" DisplayName="Department" Name="Department" StaticName="Department" MaxLength="255" Indexed="TRUE" />'
Ensure-Field $posts.Id $postFields 'DepartmentId' `
  '<Field Type="Number" DisplayName="DepartmentId" Name="DepartmentId" StaticName="DepartmentId" Decimals="0" />'

# ------------------------------------------------------- 3. DiscussionLikes --
Write-Host "`n[3/6] DiscussionLikes list" -ForegroundColor Cyan

$likes = $null
try { $likes = Invoke-SPGet "/web/lists/getbytitle('DiscussionLikes')?`$select=Id,Title,ItemCount" } catch { }

if ($likes) {
  Skip "list already exists ($($likes.ItemCount) items)"
} else {
  Step "create list 'DiscussionLikes' (one row per like)"
  if (-not $DryRun) {
    $likes = Invoke-SPPost '/web/lists' @{
      __metadata      = @{ type = 'SP.List' }
      Title           = 'DiscussionLikes'
      BaseTemplate    = 100
      Description     = 'One row per like. Kept off DiscussionPosts so liking a post cannot reset its approval status.'
      OnQuickLaunch   = $false
    }
  }
}
if ($likes -and -not $DryRun) {
  $likeFields = (Invoke-SPGet "/web/lists(guid'$($likes.Id)')/fields?`$select=InternalName").value.InternalName
  Ensure-Field $likes.Id $likeFields 'PostId' `
    '<Field Type="Number" DisplayName="PostId" Name="PostId" StaticName="PostId" Decimals="0" Indexed="TRUE" Required="TRUE" />'
  # At runtime the liker is the row's Author -- set by SharePoint, unspoofable,
  # and the widget never writes LikedBy. LikedBy exists only so the one-off
  # migration below can attribute historic likes it did not create. Readers
  # take LikedById when present, else AuthorId.
  Ensure-Field $likes.Id $likeFields 'LikedBy' `
    '<Field Type="User" DisplayName="LikedBy" Name="LikedBy" StaticName="LikedBy" UserSelectionMode="PeopleOnly" />'
}

# --------------------------------------------------- 4. content approval on --
Write-Host "`n[4/6] Content approval on DiscussionPosts" -ForegroundColor Cyan

# DraftVersionVisibility: 0 = any reader, 1 = author + those who can edit,
# 2 = author + those who can APPROVE. 2 is the setting that does the hiding.
if ($posts.EnableModeration -and $posts.DraftVersionVisibility -eq 2) {
  Skip 'content approval already enabled with approver-only draft visibility'
} else {
  Step "EnableModeration=true, EnableVersioning=true, DraftVersionVisibility=2 (approvers only)"
  if (-not $DryRun) {
    Invoke-SPPost "/web/lists(guid'$($posts.Id)')" @{
      __metadata             = @{ type = 'SP.List' }
      EnableModeration       = $true
      EnableVersioning       = $true
      DraftVersionVisibility = 2
    } -Merge | Out-Null
  }
}

# ---------------------------------------------------------- 5. permissions --
Write-Host "`n[5/6] List permissions" -ForegroundColor Cyan

# Super Admin = Site Collection Administrators. SharePoint exempts them from
# list permissions, so they need no grant here -- and every other principal is
# deliberately left WITHOUT Delete Items, which is what makes deleting
# exclusive to them (requirements 13, 14). That includes the site owners group.
$everyone = Invoke-SPGet ("/web/siteusers/getbyloginname(@v)?@v='" + [uri]::EscapeDataString('c:0(.s|true') + "'")
$deptGroups = (Invoke-SPGet '/web/sitegroups?$select=Id,Title&$top=200').value |
                Where-Object { $_.Title -like 'Dept Admins - *' }
$admins = (Invoke-SPGet "/web/siteusers?`$filter=IsSiteAdmin eq true&`$select=Title").value

Write-Host "  principals: Everyone=$($everyone.Id)  deptGroups=$($deptGroups.Count)" -ForegroundColor DarkGray
Write-Host "  Super Admins (site collection administrators): $(($admins | ForEach-Object { $_.Title }) -join ', ')" -ForegroundColor DarkGray

<#
  Makes a list's permissions exactly $Assignments (principalId -> roleDefId):
  grants what is missing and REMOVES every other principal and role binding.
  Removal matters because breaking inheritance by hand copies the site's
  permissions, and any leftover Edit/Contribute/Approve/Full Control entry
  carries Delete Items. "Limited Access" bindings are system-managed and left
  alone.
#>
function Set-ListPerms {
  param([string] $Title, [hashtable] $Assignments)

  $l = Invoke-SPGet "/web/lists/getbytitle('$Title')?`$select=Id,Title,HasUniqueRoleAssignments"
  $current = @()
  if (-not $l.HasUniqueRoleAssignments) {
    Step "$Title -> break permission inheritance (no copy)"
    if (-not $DryRun) {
      Invoke-SPPost "/web/lists(guid'$($l.Id)')/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)" | Out-Null
      $current = @((Invoke-SPGet "/web/lists(guid'$($l.Id)')/roleassignments?`$expand=Member,RoleDefinitionBindings&`$top=500").value)
    }
  } else {
    Skip "$Title already has unique permissions"
    $current = @((Invoke-SPGet "/web/lists(guid'$($l.Id)')/roleassignments?`$expand=Member,RoleDefinitionBindings&`$top=500").value)
  }

  # grant what is missing
  foreach ($principalId in $Assignments.Keys) {
    $rid = $Assignments[$principalId]
    $have = $current | Where-Object { $_.PrincipalId -eq [int]$principalId -and ($_.RoleDefinitionBindings.Id -contains [int]$rid) }
    if ($have) { Skip "$Title -> principal $principalId already holds role $rid"; continue }
    Step "$Title -> grant role $rid to principal $principalId"
    if (-not $DryRun) {
      Invoke-SPPost "/web/lists(guid'$($l.Id)')/roleassignments/addroleassignment(principalid=$principalId,roledefid=$rid)" | Out-Null
    }
  }

  # remove everything else
  foreach ($ra in $current) {
    $keep = $Assignments["$($ra.PrincipalId)"]
    foreach ($b in @($ra.RoleDefinitionBindings)) {
      if ($b.Name -eq 'Limited Access') { continue }
      if ($keep -and [int]$b.Id -eq [int]$keep) { continue }
      Step "$Title -> REMOVE '$($b.Name)' from '$($ra.Member.Title)'"
      if (-not $DryRun) {
        Invoke-SPPost "/web/lists(guid'$($l.Id)')/roleassignments/removeroleassignment(principalid=$($ra.PrincipalId),roledefid=$($b.Id))" | Out-Null
      }
    }
  }
}

# DiscussionPosts: staff may add and edit but never delete; every department's
# admin group may approve; nobody but site collection administrators deletes.
$postAssign = @{ "$($everyone.Id)" = $roleContribute }
foreach ($g in $deptGroups) { $postAssign["$($g.Id)"] = $roleApprove }
Set-ListPerms -Title 'DiscussionPosts' -Assignments $postAssign

# Comments are NOT moderated (the CR only restricts deleting them), so staff
# get the same no-delete level.
Set-ListPerms -Title 'DiscussionComments' -Assignments @{ "$($everyone.Id)" = $roleContribute }

# Likes must be deletable by their author -> stock Contribute, not Feed Contribute.
if (-not $DryRun -or $likes) {
  Set-ListPerms -Title 'DiscussionLikes' -Assignments @{ "$($everyone.Id)" = (RoleByName 'Contribute').Id }
}

# ------------------------------------------------------- 6. migrate likes ---
Write-Host "`n[6/6] Migrate existing likes" -ForegroundColor Cyan

if ($DryRun) {
  Step 'copy Likes from DiscussionPosts into DiscussionLikes (skipped in dry run)'
} else {
  $existing = @{}
  foreach ($row in (Invoke-SPGet "/web/lists(guid'$($likes.Id)')/items?`$select=PostId,LikedById,AuthorId&`$top=5000" -AsHashtable).value) {
    $who = if ($row.LikedById) { $row.LikedById } else { $row.AuthorId }
    $existing["$($row.PostId)|$who"] = $true
  }
  $moved = 0
  $entityType = (Invoke-SPGet "/web/lists(guid'$($likes.Id)')?`$select=ListItemEntityTypeFullName").ListItemEntityTypeFullName
  $src = (Invoke-SPGet "/web/lists(guid'$($posts.Id)')/items?`$select=Id,LikesId&`$top=5000" -AsHashtable).value
  foreach ($p in $src) {
    foreach ($uid in @($p.LikesId)) {
      if (-not $uid) { continue }
      if ($existing["$($p.Id)|$uid"]) { continue }
      # Author would be whoever runs this script, so stamp LikedBy instead.
      Invoke-SPPost "/web/lists(guid'$($likes.Id)')/items" @{
        __metadata = @{ type = $entityType }
        Title      = "Post $($p.Id)"
        PostId     = $p.Id
        LikedById  = $uid
      } | Out-Null
      $moved++
    }
  }
  Write-Host "  migrated $moved like(s)" -ForegroundColor Yellow
}

Write-Host "`nDone. $($plan.Count) change(s)." -ForegroundColor Green
if ($DryRun) { Write-Host "Re-run without -DryRun to apply." -ForegroundColor Magenta }
