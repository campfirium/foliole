param(
  [Parameter(Mandatory = $true)][string]$RepoRoot,
  [Parameter(Mandatory = $true)][int]$SessionProcessId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-SshSession {
  $parts = @($env:SSH_CONNECTION -split '\s+' | Where-Object { $_ })
  if ($parts.Count -ne 4) { throw "SSH_CONNECTION is required" }
  return [ordered]@{
    clientAddress = $parts[0]
    serverAddress = $parts[2]
    serverPort = [int]$parts[3]
    sessionProcessId = $SessionProcessId
  }
}

function Get-ActiveAdapters {
  return @(Get-NetAdapter -Physical -ErrorAction Stop |
    Where-Object { $_.Status -eq "Up" } |
    ForEach-Object {
      $config = Get-NetIPConfiguration -InterfaceIndex $_.ifIndex -ErrorAction Stop
      [ordered]@{
        interfaceAlias = [string]$_.Name
        interfaceIndex = [int]$_.ifIndex
        ipv4 = @($config.IPv4Address | ForEach-Object {
          [ordered]@{ address = [string]$_.IPAddress; prefixLength = [int]$_.PrefixLength }
        })
        mediaType = [string]$_.MediaType
      }
    })
}

function Get-ConnectedVpn {
  $vpn = @(Get-VpnConnection -AllUserConnection:$false -ErrorAction SilentlyContinue |
    Where-Object { $_.ConnectionStatus -eq "Connected" } |
    ForEach-Object { [ordered]@{ name = [string]$_.Name; status = [string]$_.ConnectionStatus } })
  return $vpn
}

function Get-DnsSdService {
  $service = Get-Service -Name Dnscache -ErrorAction Stop
  return [ordered]@{ name = [string]$service.Name; status = [string]$service.Status }
}

function Get-FirewallFacts {
  $profiles = @(Get-NetFirewallProfile -ErrorAction Stop | ForEach-Object {
    [ordered]@{
      defaultInboundAction = [string]$_.DefaultInboundAction
      defaultOutboundAction = [string]$_.DefaultOutboundAction
      enabled = [bool]$_.Enabled
      name = [string]$_.Name
    }
  })
  $rules = @(Get-NetFirewallRule -ErrorAction Stop |
    Where-Object { $_.DisplayName -match "mDNS|Foliole|Bonjour" } |
    ForEach-Object {
      [ordered]@{
        action = [string]$_.Action
        direction = [string]$_.Direction
        displayName = [string]$_.DisplayName
        enabled = [string]$_.Enabled
        profile = [string]$_.Profile
      }
    })
  return [ordered]@{ profiles = $profiles; relevantRules = $rules }
}

if (!(Test-Path -LiteralPath $RepoRoot -PathType Container)) { throw "Repository root is missing" }
$session = Get-SshSession
$profiles = @(Get-NetConnectionProfile -ErrorAction Stop | ForEach-Object {
  [ordered]@{
    interfaceAlias = [string]$_.InterfaceAlias
    interfaceIndex = [int]$_.InterfaceIndex
    ipv4Connectivity = [string]$_.IPv4Connectivity
    ipv6Connectivity = [string]$_.IPv6Connectivity
    networkCategory = [string]$_.NetworkCategory
  }
})

[ordered]@{
  activePhysicalAdapters = Get-ActiveAdapters
  capturedAt = [DateTime]::UtcNow.ToString("o")
  connectedVpn = Get-ConnectedVpn
  dnsSdService = Get-DnsSdService
  firewall = Get-FirewallFacts
  networkProfiles = $profiles
  schemaVersion = 1
  sshSession = $session
} | ConvertTo-Json -Depth 8 -Compress
