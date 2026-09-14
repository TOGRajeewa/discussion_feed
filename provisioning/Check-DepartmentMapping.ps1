<#
  Reports User Profile "Department" values that do not match a row in the
  Departments list.

  Posts are routed to a department admin by that match (requirement 2), so a
  profile that fails it produces a post the composer has to ask about. This is
  the check that catches, for example, "Bank Supervision Department edited"
  before anyone wonders why their queue looks short.

  Run after any bulk profile change or AD sync:

    pwsh .\Check-DepartmentMapping.ps1 -SiteUrl "https://mansaladev.cbsl.lk"

  Exits non-zero if anything is unmatched, so it can gate a release. Also exits
  non-zero if it found no departments or no users to check -- an empty run
  otherwise reports "UNMATCHED : 0", which reads exactly like a pass.
#>
#Requires -Version 7.0
param(
  [Parameter(Mandatory = $true)] [string] $SiteUrl,
  [pscredential] $Credential,
  [switch] $IncludeMatched
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'SPRest.psm1') -Force
Connect-SPRest -SiteUrl $SiteUrl -Credential $Credential

$departments = @((Invoke-SPGet "/web/lists/getbytitle('Departments')/items?`$select=Id,Title&`$top=500" -AsHashtable).value)
if ($departments.Count -eq 0) {
  Write-Host "The Departments list returned no items. Nothing was checked -- this is NOT a pass." -ForegroundColor Red
  exit 3
}
$titles = @{}
foreach ($d in $departments) { $titles[$d.Title.Trim().ToLower()] = $d.Title }
Write-Host "$($departments.Count) department(s) in the list.`n" -ForegroundColor Cyan

# Mirrors DepartmentService.match(): exact, else compare with a trailing
# "Department" removed from either side. Anything looser could file a post with
# the wrong department's admins.
function Strip($s) { ($s -replace '\s+department\s*$', '').Trim().ToLower() }
$stripped = @{}
foreach ($d in $departments) {
  $k = Strip $d.Title
  if (-not $stripped.ContainsKey($k)) { $stripped[$k] = @() }
  $stripped[$k] += $d.Title
}

# Every user the site knows about, which is the population that can post.
$users = @((Invoke-SPGet "/web/siteusers?`$select=Id,Title,LoginName,PrincipalType&`$top=2000" -AsHashtable).value |
  Where-Object { $_.PrincipalType -eq 1 -and $_.LoginName -like '*|*' -and $_.LoginName -notlike 'c:0*' })
if ($users.Count -eq 0) {
  Write-Host "No named users found on the site. Nothing was checked -- this is NOT a pass." -ForegroundColor Red
  exit 3
}

$matched = 0; $blank = @(); $unmatched = @(); $noProfile = @()

foreach ($u in $users) {
  $enc = [uri]::EscapeDataString($u.LoginName)
  try {
    $p = Invoke-SPGet "/SP.UserProfiles.PeopleManager/GetPropertiesFor(accountName=@v)?@v='$enc'"
  } catch { $noProfile += $u.Title; continue }
  if (-not $p) { $noProfile += $u.Title; continue }

  $dept = ($p.UserProfileProperties | Where-Object { $_.Key -eq 'Department' }).Value
  $dept = if ($dept) { $dept.Trim() } else { '' }

  if (-not $dept) { $blank += $u.Title; continue }

  if ($titles.ContainsKey($dept.ToLower())) {
    $matched++
    if ($IncludeMatched) { Write-Host ("  OK       {0,-24} -> {1}" -f $u.Title, $titles[$dept.ToLower()]) -ForegroundColor DarkGray }
    continue
  }

  $k = Strip $dept
  if ($stripped.ContainsKey($k) -and $stripped[$k].Count -eq 1) {
    $matched++
    Write-Host ("  FUZZY    {0,-24} '{1}' -> '{2}'" -f $u.Title, $dept, $stripped[$k][0]) -ForegroundColor Yellow
    continue
  }

  $unmatched += [pscustomobject]@{ User = $u.Title; Value = $dept }
}

Write-Host ""
Write-Host "matched          : $matched" -ForegroundColor Green
Write-Host "blank Department : $($blank.Count)" -ForegroundColor $(if ($blank.Count) { 'Yellow' } else { 'Green' })
Write-Host "no profile       : $($noProfile.Count)" -ForegroundColor DarkGray
Write-Host "UNMATCHED        : $($unmatched.Count)" -ForegroundColor $(if ($unmatched.Count) { 'Red' } else { 'Green' })

if ($blank.Count) {
  Write-Host "`nBlank Department (composer will ask these users to pick):" -ForegroundColor Yellow
  $blank | ForEach-Object { Write-Host "  $_" }
}
if ($unmatched.Count) {
  Write-Host "`nUnmatched Department values -- fix the profile or add the department:" -ForegroundColor Red
  $unmatched | ForEach-Object { Write-Host ("  {0,-24} '{1}'" -f $_.User, $_.Value) }
}

# Every profile lookup failing means the User Profile Service was unreachable,
# not that everyone is fine.
if ($noProfile.Count -eq $users.Count) {
  Write-Host "`nNo user profile could be read, so no department was checked -- this is NOT a pass." -ForegroundColor Red
  Write-Host "Check the User Profile Service application is running and the account can read profiles." -ForegroundColor Red
  exit 3
}

exit $(if ($unmatched.Count) { 1 } else { 0 })
