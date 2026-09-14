#Requires -Version 7.0
<#
  Supplies credentials for the moderation test scripts WITHOUT putting them in
  the repository. Earlier revisions of those scripts had the test-account
  passwords inline; this replaces that.

  Resolution order:

    1. provisioning\test-accounts.local.json  (gitignored)
         { "testuser2": "...", "spuser": "...", "superadmin": "..." }

    2. environment variables, one per account, upper-cased and prefixed:
         $env:DF_TEST_TESTUSER2 = '...'

  Ask for an account that has not been supplied and you get a clear error
  naming it, rather than a confusing 401 midway through a run.
#>

$script:Accounts = $null

function Get-TestAccountTable {
  if ($script:Accounts) { return $script:Accounts }

  $table = @{}
  $file = Join-Path $PSScriptRoot 'test-accounts.local.json'
  if (Test-Path $file) {
    $json = Get-Content $file -Raw | ConvertFrom-Json
    foreach ($p in $json.PSObject.Properties) { $table[$p.Name.ToLower()] = $p.Value }
  }

  $script:Accounts = $table
  return $table
}

function Get-TestCredential {
  param(
    [Parameter(Mandatory)] [string] $User,
    [string] $Domain = 'ad-him'
  )

  $table = Get-TestAccountTable
  $key = $User.ToLower()
  $pw = $null

  if ($table.ContainsKey($key)) { $pw = $table[$key] }
  if (-not $pw) {
    $envName = 'DF_TEST_' + ($User -replace '[^A-Za-z0-9]', '').ToUpper()
    $pw = [Environment]::GetEnvironmentVariable($envName)
  }

  if (-not $pw) {
    throw ("No password for '$User'. Add it to provisioning\test-accounts.local.json " +
           "(gitignored) as { `"$User`": `"...`" }, or set " +
           "`$env:DF_TEST_" + ($User -replace '[^A-Za-z0-9]', '').ToUpper() + ".")
  }

  return [pscredential]::new("$Domain\$User", (ConvertTo-SecureString $pw -AsPlainText -Force))
}

<# True when a password is available, for optional steps that should skip
   rather than fail when an account was not supplied. #>
function Test-TestCredential {
  param([Parameter(Mandatory)] [string] $User)
  $table = Get-TestAccountTable
  if ($table.ContainsKey($User.ToLower()) -and $table[$User.ToLower()]) { return $true }
  $envName = 'DF_TEST_' + ($User -replace '[^A-Za-z0-9]', '').ToUpper()
  return [bool][Environment]::GetEnvironmentVariable($envName)
}

Export-ModuleMember -Function Get-TestCredential, Test-TestCredential
