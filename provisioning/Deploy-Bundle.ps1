<#
  Uploads the standalone bundle over WebDAV, verifies it arrived byte-for-byte,
  and bumps the cache-buster the portal uses to reference it.

  Why not Upload-Standalone.ps1: that script uses Connect-PnPOnline, and the
  only PnP module available here is PnP.PowerShell 3.x, which targets
  SharePoint Online and cannot connect to an on-prem farm. WebDAV needs nothing
  installed.

  The hash check is not ceremony. An earlier upload of this bundle went up
  through a text-mode transfer that rewrote every LF as CRLF, producing a file
  54 bytes larger than the source that still worked -- and that quietly cost
  a day of chasing a difference that did not exist.

    # dry run
    .\Deploy-Bundle.ps1 -SiteHost "124.43.17.138" -Port 9371 -DryRun

    # deploy and bump the portal reference
    .\Deploy-Bundle.ps1 -SiteHost "124.43.17.138" -Port 9371 -NewVersion 20260911a
#>
param(
  [Parameter(Mandatory = $true)] [string] $SiteHost,
  [int]    $Port = 80,
  [string] $BundlePath = (Join-Path $PSScriptRoot '..\dist-standalone\discussion-feed.bundle.js'),
  # Server-relative folder holding the bundle, no trailing slash.
  [string] $TargetFolder = 'SiteAssets/SiteComponents/discussion-feed',
  # The portal script that references the bundle, and the new ?v= value.
  # Omit -NewVersion to upload without touching the portal file.
  [string] $PortalScript = 'SiteAssets/SiteComponents/js/cbsl-portal.bundle.js',
  [string] $NewVersion,
  [string] $BackupDir = (Join-Path $env:TEMP 'discussion-feed-backups'),
  [switch] $DryRun
)

$ErrorActionPreference = 'Stop'

$dav = "\\$SiteHost@$Port\DavWWWRoot"
$bundleName = Split-Path $BundlePath -Leaf
$remoteBundle = Join-Path $dav ($TargetFolder -replace '/', '\') | Join-Path -ChildPath $bundleName
$remotePortal = Join-Path $dav ($PortalScript -replace '/', '\')

function Step($m) { Write-Host "  $m" -ForegroundColor Yellow }
function Ok($m)   { Write-Host "  $m" -ForegroundColor Green }
function Note($m) { Write-Host "  $m" -ForegroundColor DarkGray }

Write-Host "`nWebDAV root : $dav" -ForegroundColor Cyan
Write-Host "Bundle      : $BundlePath"
Write-Host "Target      : $remoteBundle"
if ($DryRun) { Write-Host "`nDRY RUN - nothing will be changed" -ForegroundColor Magenta }

if (-not (Test-Path $BundlePath)) { throw "Bundle not found: $BundlePath. Build it first." }
if (-not (Test-Path $dav)) {
  throw "Cannot reach $dav. Check the host and port, that you are on the network, and that the WebClient service is running."
}

# ------------------------------------------------------------- backup ------
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$bk = Join-Path $BackupDir $stamp
Write-Host "`n[1/4] Backup" -ForegroundColor Cyan
if ($DryRun) {
  Note "would back up the current remote files to $bk"
} else {
  New-Item -ItemType Directory -Path $bk -Force | Out-Null
  foreach ($f in @($remoteBundle, $remotePortal)) {
    if (Test-Path $f) {
      Copy-Item $f (Join-Path $bk (Split-Path $f -Leaf)) -Force
      Ok "backed up $(Split-Path $f -Leaf)"
    } else { Note "$(Split-Path $f -Leaf) not present remotely (first deploy?)" }
  }
  Note "backups in $bk"
}

# ------------------------------------------------------------- upload ------
Write-Host "`n[2/4] Upload bundle" -ForegroundColor Cyan
$localHash = (Get-FileHash $BundlePath -Algorithm SHA256).Hash
$localSize = (Get-Item $BundlePath).Length
Note "local: $localSize bytes, sha256 $($localHash.Substring(0,16))..."

if ($DryRun) {
  Note 'would copy the bundle and verify its hash'
} else {
  Copy-Item $BundlePath $remoteBundle -Force
  Start-Sleep -Milliseconds 500
  $remoteHash = (Get-FileHash $remoteBundle -Algorithm SHA256).Hash
  $remoteSize = (Get-Item $remoteBundle).Length
  if ($remoteHash -ne $localHash) {
    throw ("Upload corrupted: remote is $remoteSize bytes, sha256 $($remoteHash.Substring(0,16))... " +
           "Restore from $bk and retry. A size difference of a few dozen bytes usually means " +
           "line endings were rewritten in transit.")
  }
  Ok "uploaded and verified byte-identical ($remoteSize bytes)"
}

# ------------------------------------------------------ cache-buster -------
Write-Host "`n[3/4] Portal cache-buster" -ForegroundColor Cyan

if (-not $NewVersion) {
  Note 'no -NewVersion given; portal file untouched'
  Note 'browsers will keep serving the cached bundle until the ?v= changes'
} elseif (-not (Test-Path $remotePortal)) {
  Note "$PortalScript not found; skipping"
} else {
  $text = [IO.File]::ReadAllText($remotePortal)
  $pattern = [regex]::Escape($bundleName) + '\?v=[A-Za-z0-9._-]+'
  $found = [regex]::Matches($text, $pattern)
  if ($found.Count -ne 1) {
    throw "Expected exactly one '$bundleName?v=...' reference in $PortalScript, found $($found.Count). Update it by hand."
  }
  $current = $found[0].Value
  $replacement = "$bundleName`?v=$NewVersion"
  Note "current: $current"
  Step  "new    : $replacement"
  if (-not $DryRun) {
    $updated = $text.Replace($current, $replacement)
    if ($updated.Length -ne $text.Length - $current.Length + $replacement.Length) {
      throw 'Unexpected length change while rewriting the version string; aborting.'
    }
    [IO.File]::WriteAllText($remotePortal, $updated)
    Start-Sleep -Milliseconds 500
    $check = [IO.File]::ReadAllText($remotePortal)
    if ($check -notmatch [regex]::Escape($replacement)) { throw "Version bump did not take. Restore $PortalScript from $bk." }
    Ok "portal now references ?v=$NewVersion"
  }
}

# -------------------------------------------------------------- serve ------
Write-Host "`n[4/4] Verify over HTTP" -ForegroundColor Cyan
$base = "http://${SiteHost}:$Port"
$url = "$base/$TargetFolder/$bundleName" + $(if ($NewVersion) { "?v=$NewVersion" } else { '' })
if ($DryRun) {
  Note "would GET $url"
} else {
  try {
    $r = Invoke-WebRequest -Uri $url -UseDefaultCredentials -AllowUnencryptedAuthentication -ErrorAction Stop
    Ok "$($r.StatusCode) from $url ($($r.RawContentLength) bytes)"
  } catch {
    Write-Host "  Could not fetch as the current user: $($_.Exception.Message)" -ForegroundColor Yellow
    Note 'Check it in a browser signed in as an ordinary member of staff.'
  }
}

Write-Host "`nDone." -ForegroundColor Green
if (-not $DryRun) { Write-Host "Rollback: copy the files in $bk back over the originals." -ForegroundColor DarkGray }
if ($DryRun) { Write-Host "Re-run without -DryRun to apply." -ForegroundColor Magenta }
