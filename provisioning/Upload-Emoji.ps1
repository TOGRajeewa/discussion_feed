<#
  Upload emoji PNGs from .\assets\emoji to SiteAssets/[Subfolder/]emoji.

    Connect-PnPOnline -Url "https://intranet/sites/CBSL" -CurrentCredentials
    .\Upload-Emoji.ps1 -SiteUrl "https://intranet/sites/CBSL" -Subfolder "DiscussionFeeds"

  With -Subfolder "DiscussionFeeds" -> SiteAssets/DiscussionFeeds/emoji.
  Omit -Subfolder to upload to SiteAssets/emoji.
  The emojiBaseUrl passed to the web part / snippet must match the target folder.
#>
param(
  [Parameter(Mandatory = $true)] [string] $SiteUrl,
  [string] $Subfolder = "",
  [string] $Source = "$(Split-Path $PSScriptRoot -Parent)\assets\emoji"
)

if (-not (Test-Path $Source)) { throw "Not found: $Source" }

Connect-PnPOnline -Url $SiteUrl -CurrentCredentials

$target = "SiteAssets/emoji"
if ($Subfolder) { $target = "SiteAssets/$($Subfolder.Trim('/'))/emoji" }
Resolve-PnPFolder -SiteRelativePath $target | Out-Null

Get-ChildItem -Path $Source -File -Filter *.png | ForEach-Object {
  Add-PnPFile -Path $_.FullName -Folder $target | Out-Null
  Write-Host "Uploaded $target/$($_.Name)" -ForegroundColor DarkGray
}

Write-Host "Done. Set emojiBaseUrl to /$target/ (with a trailing slash)." -ForegroundColor Green
