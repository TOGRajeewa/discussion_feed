<#
  Minimal SharePoint REST helper for on-premises SharePoint.

  Why REST and not PnP: the only PnP module available on this machine is
  PnP.PowerShell 3.x, which targets SharePoint Online exclusively and cannot
  connect to an on-prem farm. The legacy SharePointPnPPowerShell2019 module
  needs Windows PowerShell 5.1. REST with -UseDefaultCredentials works from
  PowerShell 7 today with no extra dependency.
#>

$script:SiteUrl = $null
$script:Digest = $null

function Connect-SPRest {
  param([Parameter(Mandatory)] [string] $SiteUrl)
  $script:SiteUrl = $SiteUrl.TrimEnd('/')
  $r = Invoke-WebRequest -Uri "$script:SiteUrl/_api/contextinfo" -Method Post `
    -Headers @{ Accept = 'application/json;odata=nometadata' } `
    -UseDefaultCredentials -AllowUnencryptedAuthentication
  $script:Digest = ($r.Content | ConvertFrom-Json).FormDigestValue
  $me = Invoke-SPGet '/web/currentuser'
  Write-Host "Connected to $script:SiteUrl as $($me.Title) (siteAdmin=$($me.IsSiteAdmin))" -ForegroundColor Cyan
}

<#
  -AsHashtable is needed for list-item queries: SharePoint returns both "Id"
  and "ID" for the same value, which ConvertFrom-Json rejects as a duplicate
  key when building objects.
#>
function Invoke-SPGet {
  param(
    [Parameter(Mandatory)] [string] $Path,
    [switch] $AsHashtable
  )
  $u = if ($Path -like 'http*') { $Path } else { "$script:SiteUrl/_api$Path" }
  $r = Invoke-WebRequest -Uri $u -Headers @{ Accept = 'application/json;odata=nometadata' } `
    -UseDefaultCredentials -AllowUnencryptedAuthentication
  if ([string]::IsNullOrWhiteSpace($r.Content)) { return $null }
  if ($AsHashtable) { return $r.Content | ConvertFrom-Json -AsHashtable }
  return $r.Content | ConvertFrom-Json
}

<# POST, or MERGE when -Merge is given (SharePoint updates use X-HTTP-Method: MERGE). #>
function Invoke-SPPost {
  param(
    [Parameter(Mandatory)] [string] $Path,
    $Body,
    [switch] $Merge,
    [switch] $Verbose_
  )
  $h = @{
    Accept          = 'application/json;odata=verbose'
    'X-RequestDigest' = $script:Digest
  }
  if ($Merge) { $h['X-HTTP-Method'] = 'MERGE'; $h['IF-MATCH'] = '*' }

  $req = @{
    Uri                          = "$script:SiteUrl/_api$Path"
    Method                       = 'Post'
    Headers                      = $h
    UseDefaultCredentials        = $true
    AllowUnencryptedAuthentication = $true
  }
  if ($null -ne $Body) {
    $req['Body'] = ($Body | ConvertTo-Json -Depth 12 -Compress)
    $req['ContentType'] = 'application/json;odata=verbose'
  }
  $r = Invoke-WebRequest @req
  if ([string]::IsNullOrWhiteSpace($r.Content)) { return $null }
  # List-item responses echo both "Id" and "ID"; parse as a hashtable so the
  # duplicate key does not turn a successful write into a terminating error.
  try { return ($r.Content | ConvertFrom-Json).d }
  catch { return ($r.Content | ConvertFrom-Json -AsHashtable).d }
}

function Invoke-SPDelete {
  param([Parameter(Mandatory)] [string] $Path)
  Invoke-WebRequest -Uri "$script:SiteUrl/_api$Path" -Method Post `
    -Headers @{
      Accept            = 'application/json;odata=verbose'
      'X-RequestDigest' = $script:Digest
      'X-HTTP-Method'   = 'DELETE'
      'IF-MATCH'        = '*'
    } -UseDefaultCredentials -AllowUnencryptedAuthentication | Out-Null
}

Export-ModuleMember -Function Connect-SPRest, Invoke-SPGet, Invoke-SPPost, Invoke-SPDelete
