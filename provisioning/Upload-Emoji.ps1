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

# Upload only the emojis referenced in emojiSet.ts (the curated set), not the whole folder.
$tsPath = "$(Split-Path $PSScriptRoot -Parent)\src\webparts\discussionFeed\components\emojiSet.ts"
$names = @()
if (Test-Path $tsPath) {
  $names = Select-String -Path $tsPath -Pattern "file: '([^']+\.png)'" -AllMatches |
    ForEach-Object { $_.Matches } | ForEach-Object { $_.Groups[1].Value }
}
if (-not $names -or $names.Count -eq 0) {
  Write-Host "emojiSet.ts not found/empty; uploading all PNGs in $Source." -ForegroundColor Yellow
  $names = (Get-ChildItem -Path $Source -File -Filter *.png).Name
}

Connect-PnPOnline -Url $SiteUrl -CurrentCredentials

$target = "SiteAssets/emoji"
if ($Subfolder) { $target = "SiteAssets/$($Subfolder.Trim('/'))/emoji" }
Resolve-PnPFolder -SiteRelativePath $target | Out-Null

$n = 0
foreach ($name in $names) {
  $file = Join-Path $Source $name
  if (Test-Path $file) {
    Add-PnPFile -Path $file -Folder $target | Out-Null
    $n++
  } else {
    Write-Host "  (skip, not found locally: $name)" -ForegroundColor DarkYellow
  }
}

Write-Host "Uploaded $n emoji(s) to $target. Set emojiBaseUrl to /$target/ (trailing slash)." -ForegroundColor Green
