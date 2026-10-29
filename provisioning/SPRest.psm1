#Requires -Version 5.1
<#
  Minimal SharePoint REST helper for on-premises SharePoint.

  Why REST and not PnP: the only PnP module available is PnP.PowerShell 3.x,
  which targets SharePoint Online exclusively and cannot connect to an on-prem
  farm. REST needs no extra dependency.

  Runs in both Windows PowerShell 5.1 (built into Windows; the client's
  servers allow nothing newer) and PowerShell 7. The differences are handled
  here: 7 needs -AllowUnencryptedAuthentication to send credentials over plain
  HTTP; 5.1 needs -UseBasicParsing (its default parser needs Internet
  Explorer) and has no ConvertFrom-Json -AsHashtable -- see ConvertFrom-SPJson.

  Authentication: by default requests go as the signed-in Windows user. Pass
  -Credential to Connect-SPRest to authenticate as a specific domain account,
  which is needed when this machine is not signed in with an account the farm
  recognises (e.g. running against the CBSL domain from a vendor laptop).
#>

$script:SiteUrl = $null
$script:Digest = $null
$script:Credential = $null
$script:IsCore = $PSVersionTable.PSVersion.Major -ge 6

# Windows PowerShell's progress bar slows every web request down severalfold.
$ProgressPreference = 'SilentlyContinue'
if (-not $script:IsCore) {
  Add-Type -AssemblyName System.Web.Extensions   # JavaScriptSerializer, for ConvertFrom-SPJson
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
}

<# Transport arguments that differ between Windows PowerShell 5.1 and PowerShell 7. #>
function Get-SPTransportArgs {
  if ($script:IsCore) { return @{ AllowUnencryptedAuthentication = $true } }   # harmless over HTTPS; required over plain HTTP
  return @{ UseBasicParsing = $true }
}

<# Shared auth + transport arguments for every request. #>
function Get-SPAuthArgs {
  $a = Get-SPTransportArgs
  if ($script:Credential) { $a['Credential'] = $script:Credential }
  else { $a['UseDefaultCredentials'] = $true }
  return $a
}

<#
  A request body as UTF-8 bytes. Windows PowerShell 5.1 would otherwise send a
  string body as ISO-8859-1 and mangle anything outside it.
#>
function ConvertTo-SPBody {
  param([Parameter(Mandatory)] $Body)
  # The leading comma keeps the byte[] whole: returned bare, PowerShell would
  # unroll it into an object[] of bytes, which is not sent as the body.
  return ,([Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 12 -Compress)))
}

<#
  Parse a SharePoint JSON response. -AsHashtable is needed for list items:
  SharePoint returns both "Id" and "ID" for the same value, which
  ConvertFrom-Json rejects as a duplicate key when building objects.
  PowerShell 7 has ConvertFrom-Json -AsHashtable; Windows PowerShell 5.1 does
  not, so there the JSON goes through .NET's JavaScriptSerializer and is turned
  into the same shape: case-sensitive hashtables and arrays.
#>
function ConvertFrom-SPJson {
  param([Parameter(Mandatory)] [AllowEmptyString()] [string] $Json, [switch] $AsHashtable)
  if ([string]::IsNullOrWhiteSpace($Json)) { return $null }
  if (-not $AsHashtable) { return $Json | ConvertFrom-Json }
  if ($script:IsCore) { return $Json | ConvertFrom-Json -AsHashtable }
  $serializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
  $serializer.MaxJsonLength = [int]::MaxValue
  return ConvertTo-SPHashtable $serializer.DeserializeObject($Json)
}

function ConvertTo-SPHashtable($Value) {
  if ($Value -is [System.Collections.IDictionary]) {
    $h = New-Object System.Collections.Hashtable   # case-sensitive, like ConvertFrom-Json -AsHashtable
    foreach ($k in $Value.Keys) { $h[$k] = ConvertTo-SPHashtable $Value[$k] }
    return $h
  }
  if ($Value -is [System.Collections.IList]) {
    $out = New-Object object[] $Value.Count
    for ($i = 0; $i -lt $Value.Count; $i++) { $out[$i] = ConvertTo-SPHashtable $Value[$i] }
    return ,$out
  }
  return $Value
}

<#
  Turn a failed request into a message that says what to do next, rather than
  leaving the caller to decode an HttpRequestException.
#>
function Get-SPFailureHint {
  param($ErrorRecord)
  $ex = $ErrorRecord.Exception
  $chain = @()
  $e = $ex
  while ($e) { $chain += $e.Message; $e = $e.InnerException }
  $all = $chain -join ' | '
  $status = $null
  try { $status = [int]$ex.Response.StatusCode } catch { }

  if ($all -match 'certificate|SSL|PartialChain|UntrustedRoot') {
    return ("TLS failed: this machine does not trust the site's certificate. " +
            "Install the issuing CA (for mansaladev.cbsl.lk that is 'cbsl-PDC-CA') into " +
            "Trusted Root Certification Authorities, or run from a CBSL domain-joined machine. " +
            "Detail: $all")
  }
  if ($status -eq 401) {
    return ("401 Unauthorized: the farm did not accept these credentials. " +
            "Re-run with -Credential (Get-Credential) using a domain account on that farm, " +
            "e.g. CBSL\yourname.")
  }
  if ($status -eq 403) {
    return "403 Forbidden: authenticated, but the account lacks permission on this site. Use an account with Full Control."
  }
  if ($status -eq 404) {
    return "404 Not Found: check -SiteUrl points at the site root (e.g. https://host/ or https://host/sites/name)."
  }
  if ($all -match 'No such host|name or service not known|could not be resolved') {
    return "DNS lookup failed: check the host name, and that you are on the client network or VPN."
  }
  return "Request failed$(if ($status) { " ($status)" }): $all"
}

function Connect-SPRest {
  param(
    [Parameter(Mandatory)] [string] $SiteUrl,
    [pscredential] $Credential
  )
  $script:SiteUrl = $SiteUrl.TrimEnd('/')
  $script:Credential = $Credential
  $script:Digest = $null

  # Fail here, loudly. Everything after this assumes a working connection, and
  # a script that carries on without one reports nonsense (empty queues,
  # "0 unmatched") that reads like success.
  try {
    $a = Get-SPAuthArgs
    $r = Invoke-WebRequest -Uri "$script:SiteUrl/_api/contextinfo" -Method Post `
      -Headers @{ Accept = 'application/json;odata=nometadata' } @a -ErrorAction Stop
    $script:Digest = (ConvertFrom-SPJson $r.Content).FormDigestValue
  } catch {
    throw "Could not connect to $script:SiteUrl. $(Get-SPFailureHint $_)"
  }
  if (-not $script:Digest) {
    throw "Connected to $script:SiteUrl but received no form digest. Is this a SharePoint site root?"
  }

  $me = Invoke-SPGet '/web/currentuser'
  if (-not $me -or -not $me.LoginName) {
    throw "Connected to $script:SiteUrl but could not resolve the current user."
  }
  Write-Host "Connected to $script:SiteUrl as $($me.Title) [$($me.LoginName)] (siteAdmin=$($me.IsSiteAdmin))" -ForegroundColor Cyan
}

function Assert-SPConnected {
  if (-not $script:SiteUrl -or -not $script:Digest) {
    throw 'Not connected. Call Connect-SPRest first.'
  }
}

<# -AsHashtable for list-item queries; see ConvertFrom-SPJson. #>
function Invoke-SPGet {
  param(
    [Parameter(Mandatory)] [string] $Path,
    [switch] $AsHashtable
  )
  Assert-SPConnected
  $u = if ($Path -like 'http*') { $Path } else { "$script:SiteUrl/_api$Path" }
  try {
    $a = Get-SPAuthArgs
    $r = Invoke-WebRequest -Uri $u -Headers @{ Accept = 'application/json;odata=nometadata' } @a -ErrorAction Stop
  } catch {
    throw "GET $Path failed. $(Get-SPFailureHint $_)"
  }
  return ConvertFrom-SPJson $r.Content -AsHashtable:$AsHashtable
}

<# POST, or MERGE when -Merge is given (SharePoint updates use X-HTTP-Method: MERGE). #>
function Invoke-SPPost {
  param(
    [Parameter(Mandatory)] [string] $Path,
    $Body,
    [switch] $Merge
  )
  Assert-SPConnected
  $h = @{
    Accept            = 'application/json;odata=verbose'
    'X-RequestDigest' = $script:Digest
  }
  if ($Merge) { $h['X-HTTP-Method'] = 'MERGE'; $h['IF-MATCH'] = '*' }

  $req = Get-SPAuthArgs
  $req['Uri'] = "$script:SiteUrl/_api$Path"
  $req['Method'] = 'Post'
  $req['Headers'] = $h
  if ($null -ne $Body) {
    $req['Body'] = ConvertTo-SPBody $Body
    $req['ContentType'] = 'application/json;odata=verbose;charset=utf-8'
  }
  try {
    $r = Invoke-WebRequest @req -ErrorAction Stop
  } catch {
    throw "POST $Path failed. $(Get-SPFailureHint $_)"
  }
  if ([string]::IsNullOrWhiteSpace($r.Content)) { return $null }
  # List-item responses echo both "Id" and "ID"; parse as a hashtable so the
  # duplicate key does not turn a successful write into a terminating error.
  try { return (ConvertFrom-SPJson $r.Content).d }
  catch { return (ConvertFrom-SPJson $r.Content -AsHashtable).d }
}

function Invoke-SPDelete {
  param([Parameter(Mandatory)] [string] $Path)
  Assert-SPConnected
  $a = Get-SPAuthArgs
  try {
    Invoke-WebRequest -Uri "$script:SiteUrl/_api$Path" -Method Post `
      -Headers @{
        Accept            = 'application/json;odata=verbose'
        'X-RequestDigest' = $script:Digest
        'X-HTTP-Method'   = 'DELETE'
        'IF-MATCH'        = '*'
      } @a -ErrorAction Stop | Out-Null
  } catch {
    throw "DELETE $Path failed. $(Get-SPFailureHint $_)"
  }
}

Export-ModuleMember -Function Connect-SPRest, Invoke-SPGet, Invoke-SPPost, Invoke-SPDelete, `
  Get-SPTransportArgs, ConvertTo-SPBody, ConvertFrom-SPJson
