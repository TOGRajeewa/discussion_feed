<#
  Upload the standalone classic bundle + Fabric icon fonts + TinyMCE skin to SiteAssets.
  Run AFTER `npm run build:standalone` (which populates .\dist-standalone).

    Connect-PnPOnline -Url "https://intranet/sites/CBSL" -CurrentCredentials
    .\Upload-Standalone.ps1 -SiteUrl "https://intranet/sites/CBSL" -Subfolder "DiscussionFeeds"

  With -Subfolder "DiscussionFeeds" it uploads under SiteAssets/DiscussionFeeds:
    SiteAssets/DiscussionFeeds/discussion-feed.bundle.js
    SiteAssets/DiscussionFeeds/fabric-icons/*.woff
    SiteAssets/DiscussionFeeds/tinymce/skins/lightgray/**
  Omit -Subfolder to upload to the SiteAssets root.
#>
param(
  [Parameter(Mandatory = $true)] [string] $SiteUrl,
  [string] $Subfolder = "",
  [string] $Source = "$(Split-Path $PSScriptRoot -Parent)\dist-standalone"
)

if (-not (Test-Path $Source)) {
  throw "Not found: $Source. Run 'npm run build:standalone' first."
}

Connect-PnPOnline -Url $SiteUrl -CurrentCredentials

$base = "SiteAssets"
if ($Subfolder) { $base = "SiteAssets/$($Subfolder.Trim('/'))" }

$root = (Resolve-Path $Source).Path
Get-ChildItem -Path $Source -Recurse -File | ForEach-Object {
  $rel = $_.FullName.Substring($root.Length).TrimStart('\')
  $folderRel = [System.IO.Path]::GetDirectoryName($rel) -replace '\\', '/'
  $target = $base + ($(if ($folderRel) { "/$folderRel" } else { "" }))
  Resolve-PnPFolder -SiteRelativePath $target | Out-Null
  Add-PnPFile -Path $_.FullName -Folder $target | Out-Null
  Write-Host "Uploaded $target/$([System.IO.Path]::GetFileName($rel))" -ForegroundColor DarkGray
}

Write-Host "Done. Point the Script Editor snippet's paths at $base/..." -ForegroundColor Green
