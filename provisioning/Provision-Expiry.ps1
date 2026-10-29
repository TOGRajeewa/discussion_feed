<#
  Social Corner posts expire 60 days after they are published. Expired
  posts are NOT deleted: they stay in DiscussionPosts, flagged, and the widget
  stops showing them (home page and the full Social Corner page). The
  Market Place is not affected.

  Adds four columns to DiscussionPosts:

    PublishedOn  Date and time   Set by the widget when an admin clicks Approve.
    ApprovedBy   Person          Set alongside it.
    Expired      Yes/No          Set to Yes by Expire-SocialPosts.ps1 once a post
                                 is more than 60 days old. Indexed: the feed filters
                                 on it.
    Log          Plain text      One line appended per change the job makes,
                 (multi-line)    saying when, by which account and why -- the
                                 job is the post's last editor, so its version
                                 history alone would not explain the change.

  Posts approved before this, or approved from the SharePoint list rather than
  the widget, have no PublishedOn; Expire-SocialPosts.ps1 then uses their
  last-modified date, which for an approved post is its approval time.

  Adding columns does not touch any post, so it cannot send one back to
  Pending. Idempotent -- safe to re-run. -DryRun prints the plan only.

    .\Provision-Expiry.ps1 -SiteUrl "https://mansaladev.cbsl.lk" -DryRun
    .\Provision-Expiry.ps1 -SiteUrl "https://mansaladev.cbsl.lk"
#>
#Requires -Version 5.1
param(
  [Parameter(Mandatory = $true)] [string] $SiteUrl,
  [pscredential] $Credential,
  [switch] $DryRun
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'SPRest.psm1') -Force

$plan = [System.Collections.Generic.List[string]]::new()
function Step($msg) { $plan.Add($msg); Write-Host ("  " + $msg) -ForegroundColor Yellow }
function Skip($msg) { Write-Host ("  - " + $msg) -ForegroundColor DarkGray }

Connect-SPRest -SiteUrl $SiteUrl -Credential $Credential
if ($DryRun) { Write-Host "DRY RUN - nothing will be changed`n" -ForegroundColor Magenta }

# Only site collection administrators can change DiscussionPosts once
# Provision-Moderation.ps1 has run.
$runner = Invoke-SPGet '/web/currentuser?$select=Title,IsSiteAdmin'
if (-not $runner.IsSiteAdmin) {
  $msg = "$($runner.Title) is not a Site Collection Administrator. Run this as one, or pass -Credential for such an account."
  if ($DryRun) { Write-Host "  WARNING: $msg" -ForegroundColor Yellow } else { throw $msg }
}

$posts = Invoke-SPGet "/web/lists/getbytitle('DiscussionPosts')?`$select=Id,Title,EnableModeration"
if (-not $posts.EnableModeration) {
  Write-Host "  WARNING: content approval is off on DiscussionPosts -- run Provision-Moderation.ps1 first." -ForegroundColor Yellow
}
$have = (Invoke-SPGet "/web/lists(guid'$($posts.Id)')/fields?`$select=InternalName").value.InternalName

Write-Host "`nColumns on DiscussionPosts" -ForegroundColor Cyan
function Ensure-Field([string] $InternalName, [string] $Xml) {
  if ($have -contains $InternalName) { Skip "column '$InternalName' already present"; return }
  Step "add column '$InternalName'"
  if ($DryRun) { return }
  Invoke-SPPost "/web/lists(guid'$($posts.Id)')/fields/createfieldasxml" @{
    parameters = @{
      __metadata = @{ type = 'SP.XmlSchemaFieldCreationInformation' }
      SchemaXml  = $Xml
      Options    = 12   # AddFieldToDefaultView (4) + AddFieldInternalNameHint (8)
    }
  } | Out-Null
}

Ensure-Field 'PublishedOn' `
  '<Field Type="DateTime" DisplayName="PublishedOn" Name="PublishedOn" StaticName="PublishedOn" Format="DateTime" Required="FALSE" />'
Ensure-Field 'ApprovedBy' `
  '<Field Type="User" DisplayName="ApprovedBy" Name="ApprovedBy" StaticName="ApprovedBy" UserSelectionMode="PeopleOnly" Required="FALSE" />'
Ensure-Field 'Expired' `
  '<Field Type="Boolean" DisplayName="Expired" Name="Expired" StaticName="Expired" Indexed="TRUE" Required="FALSE"><Default>0</Default></Field>'
Ensure-Field 'Log' `
  '<Field Type="Note" DisplayName="Log" Name="Log" StaticName="Log" NumLines="6" RichText="FALSE" Sortable="FALSE" Required="FALSE" />'

Write-Host ''
if ($plan.Count -eq 0) {
  Write-Host 'Nothing to do: the expiry columns are already in place.' -ForegroundColor Green
} elseif ($DryRun) {
  Write-Host "DRY RUN: $($plan.Count) change(s) planned. Run again without -DryRun to apply." -ForegroundColor Magenta
} else {
  Write-Host "Done: $($plan.Count) change(s) applied. Check with Test-Expiry.ps1." -ForegroundColor Green
}
