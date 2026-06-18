<#
  Upload emoji PNGs from .\assets\emoji to SiteAssets/emoji.

    Connect-PnPOnline -Url "https://intranet/sites/CBSL" -CurrentCredentials
    .\Upload-Emoji.ps1 -SiteUrl "https://intranet/sites/CBSL"

  Works for both the SPFx app and the standalone build (both read SiteAssets/emoji).
#>
param(
  [Parameter(Mandatory = $true)] [string] $SiteUrl,
  [string] $Source = "$(Split-Path $PSScriptRoot -Parent)\assets\emoji"
)

if (-not (Test-Path $Source)) { throw "Not found: $Source" }

Connect-PnPOnline -Url $SiteUrl -CurrentCredentials
Resolve-PnPFolder -SiteRelativePath "SiteAssets/emoji" | Out-Null

Get-ChildItem -Path $Source -File -Filter *.png | ForEach-Object {
  Add-PnPFile -Path $_.FullName -Folder "SiteAssets/emoji" | Out-Null
  Write-Host "Uploaded SiteAssets/emoji/$($_.Name)" -ForegroundColor DarkGray
}

Write-Host "Done." -ForegroundColor Green
