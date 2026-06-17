<#
  Upload the standalone classic bundle + Fabric icon fonts + TinyMCE skin to SiteAssets.
  Run AFTER `npm run build:standalone` (which populates .\dist-standalone).

    Connect-PnPOnline -Url "https://intranet/sites/CBSL" -CurrentCredentials
    .\Upload-Standalone.ps1 -SiteUrl "https://intranet/sites/CBSL"

  Uploads, preserving folder structure under SiteAssets:
    SiteAssets/discussion-feed.bundle.js
    SiteAssets/fabric-icons/*.woff
    SiteAssets/tinymce/skins/lightgray/**
#>
param(
  [Parameter(Mandatory = $true)] [string] $SiteUrl,
  [string] $Source = "$(Split-Path $PSScriptRoot -Parent)\dist-standalone"
)

if (-not (Test-Path $Source)) {
  throw "Not found: $Source. Run 'npm run build:standalone' first."
}

Connect-PnPOnline -Url $SiteUrl -CurrentCredentials

$root = (Resolve-Path $Source).Path
Get-ChildItem -Path $Source -Recurse -File | ForEach-Object {
  $rel = $_.FullName.Substring($root.Length).TrimStart('\')
  $folderRel = [System.IO.Path]::GetDirectoryName($rel) -replace '\\', '/'
  $target = "SiteAssets" + ($(if ($folderRel) { "/$folderRel" } else { "" }))
  Resolve-PnPFolder -SiteRelativePath $target | Out-Null
  Add-PnPFile -Path $_.FullName -Folder $target | Out-Null
  Write-Host "Uploaded SiteAssets/$rel" -ForegroundColor DarkGray
}

Write-Host "Done. Add a Script Editor Web Part and paste classic-script-editor-snippet.html." -ForegroundColor Green
