<#
  Creates the Market Place: a second feed beside Social Corner, for staff to
  sell things, advertise, or ask whether anyone has something. Agreed
  differences from Social Corner:

    * no approval -- a post is visible to everyone as soon as it is saved;
    * authors can delete their own posts, comments and likes, and nobody
      else's. SharePoint enforces that through the list's item-level setting
      "Create items and edit items that were created by the user" -- the
      widget only decides which Delete buttons to draw;
    * Site Collection Administrators (the Super Admins) can delete anything,
      as everywhere else: SharePoint exempts them from list permissions;
    * its own three lists, so Market Place posts never mix with Social Corner
      posts. Comments and likes need lists of their own as well:
      DiscussionComments' lookup points at DiscussionPosts, and a like stores
      a bare post id, which would collide between the two posts lists.

  Lists created:
    MarketplacePosts     Body, Category (Discussion | Question), MentionedUsers,
                         Department, DepartmentId -- the DiscussionPosts columns
                         the widget still uses. Created By and Created are
                         indexed so "My posts" keeps working past 5,000 items.
    MarketplaceComments  Body, PostLookup -> MarketplacePosts (indexed).
    MarketplaceLikes     PostId (indexed), LikedBy. The liker is the row's
                         Created By; LikedBy is never written here, but the
                         widget reads it on every likes list (Social Corner's
                         migrated likes are attributed through it), so a
                         likes list without it fails the like queries.

  Permissions on all three: inheritance broken; Everyone = Contribute; every
  other principal removed -- the site owners group included -- so deleting
  is left to authors (their own items) and Super Admins.

  Idempotent -- safe to re-run. -DryRun prints the plan and changes nothing.
  To remove it: deploy a bundle without the Market Place tab, then delete the
  three lists by hand (that deletes every Market Place post).

  Run with PowerShell 7 (pwsh) as a Site Collection Administrator.

    pwsh .\Provision-Marketplace.ps1 -SiteUrl "https://mansaladev.cbsl.lk" -DryRun
    pwsh .\Provision-Marketplace.ps1 -SiteUrl "https://mansaladev.cbsl.lk"
#>
#Requires -Version 7.0
param(
  [Parameter(Mandatory = $true)] [string] $SiteUrl,
  [pscredential] $Credential,
  [switch] $DryRun
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'SPRest.psm1') -Force

$PostsListTitle    = 'MarketplacePosts'
$CommentsListTitle = 'MarketplaceComments'
$LikesListTitle    = 'MarketplaceLikes'

$plan = [System.Collections.Generic.List[string]]::new()
function Step($msg) { $plan.Add($msg); Write-Host ("  " + $msg) -ForegroundColor Yellow }
function Skip($msg) { Write-Host ("  - " + $msg) -ForegroundColor DarkGray }

Connect-SPRest -SiteUrl $SiteUrl -Credential $Credential
if ($DryRun) { Write-Host "DRY RUN - nothing will be changed`n" -ForegroundColor Magenta }

# Step 4 removes everyone but "Everyone" from the lists. Only a site collection
# administrator keeps control of them after that, so require one up front.
$runner = Invoke-SPGet '/web/currentuser?$select=Title,IsSiteAdmin'
if (-not $runner.IsSiteAdmin) {
  $msg = "$($runner.Title) is not a Site Collection Administrator. Run this as one " +
         "(Site settings > Site collection administrators), or pass -Credential for such an account."
  if ($DryRun) { Write-Host "  WARNING: $msg" -ForegroundColor Yellow } else { throw $msg }
}

function Get-List([string] $Title) {
  try {
    return Invoke-SPGet ("/web/lists/getbytitle('$Title')?`$select=Id,Title,ItemCount,EnableModeration," +
                         "ReadSecurity,WriteSecurity,HasUniqueRoleAssignments")
  } catch { return $null }
}

# ---------------------------------------------------------------- 1. lists --
Write-Host "`n[1/4] Lists" -ForegroundColor Cyan

function Ensure-List([string] $Title, [string] $Description) {
  $l = Get-List $Title
  if ($l) { Skip "list '$Title' already exists ($($l.ItemCount) items)"; return $l }
  Step "create list '$Title'"
  if ($DryRun) { return $null }
  Invoke-SPPost '/web/lists' @{
    __metadata    = @{ type = 'SP.List' }
    Title         = $Title
    BaseTemplate  = 100
    Description   = $Description
    OnQuickLaunch = $false
  } | Out-Null
  return Get-List $Title
}

$posts    = Ensure-List $PostsListTitle    'Market Place posts. No approval; authors can delete only their own.'
$comments = Ensure-List $CommentsListTitle 'Comments on Market Place posts.'
$likes    = Ensure-List $LikesListTitle    'One row per like on a Market Place post.'

# -------------------------------------------------------------- 2. columns --
Write-Host "`n[2/4] Columns and indexes" -ForegroundColor Cyan

function Ensure-Field([object] $List, [string] $Title, [string] $InternalName, [string] $Xml) {
  if (-not $List) { Step "$Title -> add column '$InternalName'"; return }
  $have = (Invoke-SPGet "/web/lists(guid'$($List.Id)')/fields?`$select=InternalName").value.InternalName
  if ($have -contains $InternalName) { Skip "$($List.Title).$InternalName already present"; return }
  Step "$($List.Title) -> add column '$InternalName'"
  if ($DryRun) { return }
  Invoke-SPPost "/web/lists(guid'$($List.Id)')/fields/createfieldasxml" @{
    parameters = @{
      __metadata = @{ type = 'SP.XmlSchemaFieldCreationInformation' }
      SchemaXml  = $Xml
      Options    = 12   # AddFieldToDefaultView (4) + AddFieldInternalNameHint (8)
    }
  } | Out-Null
}

# Built-in columns (Created By, Created) can only be indexed after the fact.
$FieldTypes = @{ User = 'SP.FieldUser'; DateTime = 'SP.FieldDateTime'; Lookup = 'SP.FieldLookup'; Number = 'SP.FieldNumber' }
function Ensure-Indexed([object] $List, [string] $Title, [string] $InternalName) {
  if (-not $List) { Step "$Title -> index '$InternalName'"; return }
  $f = Invoke-SPGet "/web/lists(guid'$($List.Id)')/fields/getbyinternalnameortitle('$InternalName')?`$select=Indexed,TypeAsString"
  if ($f.Indexed) { Skip "$($List.Title).$InternalName already indexed"; return }
  Step "$($List.Title) -> index '$InternalName'"
  if ($DryRun) { return }
  Invoke-SPPost "/web/lists(guid'$($List.Id)')/fields/getbyinternalnameortitle('$InternalName')" @{
    __metadata = @{ type = $FieldTypes[$f.TypeAsString] }
    Indexed    = $true
  } -Merge | Out-Null
}

# Same definitions as the DiscussionPosts / DiscussionComments columns.
Ensure-Field $posts $PostsListTitle 'Body' `
  '<Field Type="Note" DisplayName="Body" Name="Body" StaticName="Body" Required="FALSE" NumLines="20" RichText="TRUE" RichTextMode="FullHtml" IsolateStyles="TRUE" Sortable="FALSE" />'
Ensure-Field $posts $PostsListTitle 'Category' `
  ('<Field Type="Choice" DisplayName="Category" Name="Category" StaticName="Category" Required="FALSE" Format="Dropdown" FillInChoice="FALSE">' +
   '<Default>Discussion</Default><CHOICES><CHOICE>Discussion</CHOICE><CHOICE>Question</CHOICE></CHOICES></Field>')
Ensure-Field $posts $PostsListTitle 'MentionedUsers' `
  '<Field Type="UserMulti" DisplayName="MentionedUsers" Name="MentionedUsers" StaticName="MentionedUsers" List="UserInfo" ShowField="ImnName" UserSelectionMode="PeopleOnly" UserSelectionScope="0" Mult="TRUE" Sortable="FALSE" Required="FALSE" />'
Ensure-Field $posts $PostsListTitle 'Department' `
  '<Field Type="Text" DisplayName="Department" Name="Department" StaticName="Department" MaxLength="255" Required="FALSE" />'
Ensure-Field $posts $PostsListTitle 'DepartmentId' `
  '<Field Type="Number" DisplayName="DepartmentId" Name="DepartmentId" StaticName="DepartmentId" Decimals="0" Required="FALSE" />'
Ensure-Indexed $posts $PostsListTitle 'Author'
Ensure-Indexed $posts $PostsListTitle 'Created'

Ensure-Field $comments $CommentsListTitle 'Body' `
  '<Field Type="Note" DisplayName="Body" Name="Body" StaticName="Body" Required="FALSE" NumLines="6" RichText="TRUE" RichTextMode="FullHtml" IsolateStyles="TRUE" Sortable="FALSE" />'
if ($posts) {
  Ensure-Field $comments $CommentsListTitle 'PostLookup' `
    ("<Field Type=`"Lookup`" DisplayName=`"PostLookup`" Name=`"PostLookup`" StaticName=`"PostLookup`" List=`"{$($posts.Id)}`" " +
     'ShowField="ID" RelationshipDeleteBehavior="None" Indexed="TRUE" Required="FALSE" />')
} else {
  Step "$CommentsListTitle -> add column 'PostLookup' (lookup to $PostsListTitle)"
}
if ($comments) { Ensure-Indexed $comments $CommentsListTitle 'PostLookup' }

Ensure-Field $likes $LikesListTitle 'PostId' `
  '<Field Type="Number" DisplayName="PostId" Name="PostId" StaticName="PostId" Decimals="0" Indexed="TRUE" Required="TRUE" />'
# Same column as DiscussionLikes.LikedBy; see the header.
Ensure-Field $likes $LikesListTitle 'LikedBy' `
  '<Field Type="User" DisplayName="LikedBy" Name="LikedBy" StaticName="LikedBy" UserSelectionMode="PeopleOnly" />'

# ------------------------------------------------------------- 3. settings --
Write-Host "`n[3/4] No approval; users edit and delete only their own items" -ForegroundColor Cyan

# ReadSecurity 1 = read all items. WriteSecurity 2 = create items, and edit or
# delete only the ones you created. Users with Override List Behaviors (Full
# Control) and site collection administrators are exempt -- step 4 leaves only
# the latter.
function Ensure-ItemLevel([object] $List, [string] $Title) {
  if (-not $List) { Step "$Title -> content approval off, read all, edit/delete own items only"; return }
  if (-not $List.EnableModeration -and $List.ReadSecurity -eq 1 -and $List.WriteSecurity -eq 2) {
    Skip "$Title already: no approval, read all, edit/delete own items only"
    return
  }
  Step "$Title -> content approval off, read all, edit/delete own items only"
  if ($DryRun) { return }
  Invoke-SPPost "/web/lists(guid'$($List.Id)')" @{
    __metadata       = @{ type = 'SP.List' }
    EnableModeration = $false
    ReadSecurity     = 1
    WriteSecurity    = 2
  } -Merge | Out-Null
  # Read it back: this setting is the whole of the "authors delete only their
  # own posts" rule, so a farm that ignored it must not go unnoticed.
  $now = Get-List $Title
  if ($now.WriteSecurity -ne 2 -or $now.ReadSecurity -ne 1 -or $now.EnableModeration) {
    throw ("$Title did not take the item-level settings (WriteSecurity=$($now.WriteSecurity)). Set it by hand: " +
           "List settings > Advanced settings > Item-level Permissions > 'Read all items' and " +
           "'Create items and edit items that were created by the user'.")
  }
}

Ensure-ItemLevel $posts    $PostsListTitle
Ensure-ItemLevel $comments $CommentsListTitle
Ensure-ItemLevel $likes    $LikesListTitle

# ---------------------------------------------------------- 4. permissions --
Write-Host "`n[4/4] List permissions" -ForegroundColor Cyan

$everyone = $null
try {
  $everyone = Invoke-SPGet ("/web/siteusers/getbyloginname(@v)?@v='" + [uri]::EscapeDataString('c:0(.s|true') + "'")
} catch {
  Step "add 'Everyone' to the site's users"
  if (-not $DryRun) { $everyone = Invoke-SPPost '/web/ensureuser' @{ logonName = 'c:0(.s|true' } }
}
$contribute = (Invoke-SPGet '/web/roledefinitions?$select=Id,Name&$top=100').value |
                Where-Object { $_.Name -eq 'Contribute' } | Select-Object -First 1
if (-not $contribute) { throw "Permission level 'Contribute' not found on this site." }
$admins = (Invoke-SPGet "/web/siteusers?`$filter=IsSiteAdmin eq true&`$select=Title").value
Write-Host "  Super Admins (site collection administrators): $(($admins | ForEach-Object { $_.Title }) -join ', ')" -ForegroundColor DarkGray

<#
  Makes a list's permissions exactly $Assignments (principalId -> roleDefId):
  grants what is missing and REMOVES every other principal and role binding.
  Same rule as Provision-Moderation.ps1: breaking inheritance by hand copies
  the site's permissions, and a leftover Edit/Full Control entry would let
  someone delete other people's posts. "Limited Access" bindings are
  system-managed and left alone.
#>
function Set-ListPerms([object] $List, [string] $Title, [hashtable] $Assignments) {
  if (-not $List) { Step "$Title -> break inheritance; Everyone = Contribute; remove everyone else"; return }
  $current = @()
  if (-not $List.HasUniqueRoleAssignments) {
    Step "$Title -> break permission inheritance (no copy)"
    if (-not $DryRun) {
      Invoke-SPPost "/web/lists(guid'$($List.Id)')/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)" | Out-Null
      $current = @((Invoke-SPGet "/web/lists(guid'$($List.Id)')/roleassignments?`$expand=Member,RoleDefinitionBindings&`$top=500").value)
    }
  } else {
    Skip "$Title already has unique permissions"
    $current = @((Invoke-SPGet "/web/lists(guid'$($List.Id)')/roleassignments?`$expand=Member,RoleDefinitionBindings&`$top=500").value)
  }

  foreach ($principalId in $Assignments.Keys) {
    $rid = $Assignments[$principalId]
    $has = $current | Where-Object { $_.PrincipalId -eq [int]$principalId -and ($_.RoleDefinitionBindings.Id -contains [int]$rid) }
    if ($has) { Skip "$Title -> principal $principalId already holds role $rid"; continue }
    Step "$Title -> grant role $rid to principal $principalId"
    if (-not $DryRun) {
      Invoke-SPPost "/web/lists(guid'$($List.Id)')/roleassignments/addroleassignment(principalid=$principalId,roledefid=$rid)" | Out-Null
    }
  }

  foreach ($ra in $current) {
    $keep = $Assignments["$($ra.PrincipalId)"]
    foreach ($b in @($ra.RoleDefinitionBindings)) {
      if ($b.Name -eq 'Limited Access') { continue }
      if ($keep -and [int]$b.Id -eq [int]$keep) { continue }
      Step "$Title -> REMOVE '$($b.Name)' from '$($ra.Member.Title)'"
      if (-not $DryRun) {
        Invoke-SPPost "/web/lists(guid'$($List.Id)')/roleassignments/removeroleassignment(principalid=$($ra.PrincipalId),roledefid=$($b.Id))" | Out-Null
      }
    }
  }
}

$assign = if ($everyone) { @{ "$($everyone.Id)" = $contribute.Id } } else { @{} }
Set-ListPerms $posts    $PostsListTitle    $assign
Set-ListPerms $comments $CommentsListTitle $assign
Set-ListPerms $likes    $LikesListTitle    $assign

# ------------------------------------------------------------------ done --
Write-Host ''
if ($plan.Count -eq 0) {
  Write-Host 'Nothing to do: the Market Place is already set up.' -ForegroundColor Green
} elseif ($DryRun) {
  Write-Host "DRY RUN: $($plan.Count) change(s) planned. Run again without -DryRun to apply." -ForegroundColor Magenta
} else {
  Write-Host "Done: $($plan.Count) change(s) applied. Check with Test-Marketplace.ps1." -ForegroundColor Green
}
