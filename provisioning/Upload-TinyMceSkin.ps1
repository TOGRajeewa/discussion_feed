<#
  Upload the TinyMCE 'lightgray' skin to SiteAssets so the editor can load it
  on-prem (no CDN). Run AFTER `npm install` so node_modules is populated.

    .\Upload-TinyMceSkin.ps1 -SiteUrl "https://intranet/sites/Intranet"
#>
param(
  [Parameter(Mandatory = $true)] [string] $SiteUrl,
  [string] $SkinSource = "$(Split-Path $PSScriptRoot -Parent)\node_modules\tinymce\skins\lightgray"
)

if (-not (Test-Path $SkinSource)) {
  throw "Skin source not found at $SkinSource. Run 'npm install' first."
}

Connect-PnPOnline -Url $SiteUrl -CurrentCredentials

$targetFolder = "SiteAssets/tinymce/skins/lightgray"
Resolve-PnPFolder -SiteRelativePath $targetFolder | Out-Null

Get-ChildItem -Path $SkinSource -Recurse -File | ForEach-Object {
  $rel = $_.FullName.Substring($SkinSource.Length).TrimStart('\')
  $destFolder = "$targetFolder/" + ([System.IO.Path]::GetDirectoryName($rel) -replace '\\','/')
  $destFolder = $destFolder.TrimEnd('/')
  Resolve-PnPFolder -SiteRelativePath $destFolder | Out-Null
  Add-PnPFile -Path $_.FullName -Folder $destFolder | Out-Null
  Write-Host "Uploaded $rel" -ForegroundColor DarkGray
}

Write-Host "TinyMCE skin deployed to $targetFolder" -ForegroundColor Green
