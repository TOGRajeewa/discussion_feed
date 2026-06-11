<#
  Provision the on-prem backing store for the Discussion Feed web part.
  Run with SharePointPnPPowerShellOnline / PnP.PowerShell connected to the SPSE site:

    Connect-PnPOnline -Url "https://intranet.contoso.local/sites/Intranet" -CurrentCredentials
    .\Provision-Lists.ps1 -SiteUrl "https://intranet.contoso.local/sites/Intranet"

  Idempotent: safe to re-run.
#>
param(
  [Parameter(Mandatory = $true)] [string] $SiteUrl
)

Connect-PnPOnline -Url $SiteUrl -CurrentCredentials

# ---------- Asset library for embedded images ----------
if (-not (Get-PnPList -Identity "FeedImages" -ErrorAction SilentlyContinue)) {
  New-PnPList -Title "FeedImages" -Template DocumentLibrary -OnQuickLaunch:$false
}

# ---------- DiscussionPosts ----------
if (-not (Get-PnPList -Identity "DiscussionPosts" -ErrorAction SilentlyContinue)) {
  New-PnPList -Title "DiscussionPosts" -Template GenericList -OnQuickLaunch:$false
}
Add-PnPField -List "DiscussionPosts" -DisplayName "Body" -InternalName "Body" `
  -Type Note -ErrorAction SilentlyContinue
# Promote Body to Enhanced Rich Text (RichTextMode=FullHtml, RichText=TRUE)
$body = Get-PnPField -List "DiscussionPosts" -Identity "Body"
$body.SchemaXml = $body.SchemaXml -replace '/>$', ' RichText="TRUE" RichTextMode="FullHtml" />'
$body.Update(); Invoke-PnPQuery

Add-PnPField -List "DiscussionPosts" -DisplayName "Category" -InternalName "Category" `
  -Type Choice -Choices "Discussion","Praise","Question" -ErrorAction SilentlyContinue

# People-or-Group, multi-select — built via field XML (Mult="TRUE", UserSelectionMode)
$likesXml = '<Field Type="UserMulti" DisplayName="Likes" Name="Likes" StaticName="Likes" Mult="TRUE" UserSelectionMode="PeopleOnly" />'
Add-PnPFieldFromXml -List "DiscussionPosts" -FieldXml $likesXml -ErrorAction SilentlyContinue

$mentXml = '<Field Type="UserMulti" DisplayName="MentionedUsers" Name="MentionedUsers" StaticName="MentionedUsers" Mult="TRUE" UserSelectionMode="PeopleOnly" />'
Add-PnPFieldFromXml -List "DiscussionPosts" -FieldXml $mentXml -ErrorAction SilentlyContinue

Add-PnPField -List "DiscussionPosts" -DisplayName "CommentCount" -InternalName "CommentCount" `
  -Type Number -ErrorAction SilentlyContinue

# ---------- DiscussionComments ----------
if (-not (Get-PnPList -Identity "DiscussionComments" -ErrorAction SilentlyContinue)) {
  New-PnPList -Title "DiscussionComments" -Template GenericList -OnQuickLaunch:$false
}
Add-PnPField -List "DiscussionComments" -DisplayName "Body" -InternalName "Body" `
  -Type Note -ErrorAction SilentlyContinue
$cbody = Get-PnPField -List "DiscussionComments" -Identity "Body"
$cbody.SchemaXml = $cbody.SchemaXml -replace '/>$', ' RichText="TRUE" RichTextMode="FullHtml" />'
$cbody.Update(); Invoke-PnPQuery

Add-PnPField -List "DiscussionComments" -DisplayName "PostLookup" -InternalName "PostLookup" `
  -Type Lookup -ErrorAction SilentlyContinue
# Bind the lookup to DiscussionPosts (Id). PnP.PowerShell:
Set-PnPField -List "DiscussionComments" -Identity "PostLookup" -Values @{
  LookupList  = (Get-PnPList -Identity "DiscussionPosts").Id.ToString()
  LookupField = "Title"
}

Write-Host "Provisioning complete. Verify Outgoing E-Mail Settings in Central Admin for notifications." -ForegroundColor Green
