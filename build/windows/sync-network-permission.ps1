param(
  [ValidateSet('Check', 'Grant', 'GrantElevated', 'Remove', 'RemoveElevated')]
  [string]$Action = 'Check',
  [Parameter(Mandatory = $true)][string]$ExecutablePath
)

$ErrorActionPreference = 'Stop'
$program = [IO.Path]::GetFullPath($ExecutablePath)
$hasher = [Security.Cryptography.SHA256]::Create()
try {
  $digest = $hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($program.ToLowerInvariant()))
} finally {
  $hasher.Dispose()
}
$identity = ([BitConverter]::ToString($digest)).Replace('-', '').Substring(0, 16).ToLowerInvariant()
$dnsName = "Foliole.Sync.Dns.$identity"
$appName = "Foliole.Sync.App.$identity"

function Read-Rule([string]$name, [string]$store = 'PersistentStore') {
  return Get-NetFirewallRule -PolicyStore $store -Name $name -ErrorAction SilentlyContinue
}

function Test-Rule([string]$name, [string]$protocol, [string]$port,
  [string]$service, [string]$application) {
  $rule = Read-Rule $name
  if ($null -eq $rule) { return 'missing' }
  $portFilter = $rule | Get-NetFirewallPortFilter
  $addressFilter = $rule | Get-NetFirewallAddressFilter
  $serviceFilter = $rule | Get-NetFirewallServiceFilter
  $applicationFilter = $rule | Get-NetFirewallApplicationFilter
  if ($rule.Enabled -ne 'True' -or $rule.Direction -ne 'Inbound' -or
      $rule.Action -ne 'Allow' -or [string]$rule.Profile -ne 'Private' -or
      [string]$portFilter.Protocol -ne $protocol -or
      [string]$portFilter.LocalPort -ne $port -or
      [string]$addressFilter.RemoteAddress -ne 'LocalSubnet' -or
      [string]$serviceFilter.Service -ne $service -or
      [string]$applicationFilter.Program -ne $application) {
    return 'conflict'
  }
  return 'ready'
}

function Read-State {
  $private = @(Get-NetConnectionProfile | Where-Object NetworkCategory -eq Private).Count -gt 0
  if (-not $private) { return @{ status = 'private_network_required' } }
  $dns = Test-Rule $dnsName 'UDP' '5353' 'Dnscache' 'Any'
  $app = Test-Rule $appName 'TCP' '38641' 'Any' $program
  if ($dns -eq 'conflict' -or $app -eq 'conflict') {
    return @{ status = 'rule_conflict' }
  }
  if ($dns -eq 'ready' -and $app -eq 'ready') {
    if ($null -eq (Read-Rule $dnsName 'ActiveStore') -or
        $null -eq (Read-Rule $appName 'ActiveStore')) {
      return @{ status = 'policy_restricted' }
    }
    return @{ status = 'ready' }
  }
  return @{ status = 'authorization_required' }
}

function Assert-Administrator {
  $principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'administrator_required'
  }
}

function Invoke-Elevated([string]$nextAction) {
  $arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' +
    $PSCommandPath + '" -Action ' + $nextAction + ' -ExecutablePath "' + $program + '"'
  try {
    $child = Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
      -Verb RunAs -ArgumentList $arguments -Wait -PassThru
  } catch {
    return @{ status = 'authorization_cancelled' }
  }
  if ($child.ExitCode -ne 0) {
    $state = Read-State
    if ($state.status -eq 'policy_restricted') { return $state }
    return @{ status = 'authorization_failed' }
  }
  if ($nextAction -eq 'RemoveElevated') { return @{ status = 'removed' } }
  return Read-State
}

try {
  if ($Action -eq 'Check') {
    $result = Read-State
  } elseif ($Action -eq 'Grant') {
    $result = Invoke-Elevated 'GrantElevated'
  } elseif ($Action -eq 'Remove') {
    if ($null -eq (Read-Rule $dnsName) -and $null -eq (Read-Rule $appName)) {
      $result = @{ status = 'removed' }
    } else {
      $result = Invoke-Elevated 'RemoveElevated'
    }
  } elseif ($Action -eq 'GrantElevated') {
    Assert-Administrator
    $state = Read-State
    if ($state.status -eq 'rule_conflict' -or $state.status -eq 'private_network_required') {
      throw $state.status
    }
    if ($null -eq (Read-Rule $dnsName)) {
      New-NetFirewallRule -Name $dnsName -DisplayName 'Foliole Sync discovery (Private)' `
        -Group 'Foliole Sync' -Direction Inbound -Action Allow -Profile Private `
        -Protocol UDP -LocalPort 5353 -RemoteAddress LocalSubnet -Service Dnscache | Out-Null
    }
    if ($null -eq (Read-Rule $appName)) {
      New-NetFirewallRule -Name $appName -DisplayName 'Foliole Sync connection (Private)' `
        -Group 'Foliole Sync' -Direction Inbound -Action Allow -Profile Private `
        -Protocol TCP -LocalPort 38641 -RemoteAddress LocalSubnet -Program $program | Out-Null
    }
    $result = Read-State
    if ($result.status -ne 'ready') { throw $result.status }
  } else {
    Assert-Administrator
    if ($null -ne (Read-Rule $dnsName) -and
        (Test-Rule $dnsName 'UDP' '5353' 'Dnscache' 'Any') -ne 'ready') {
      throw 'rule_conflict'
    }
    if ($null -ne (Read-Rule $appName) -and
        (Test-Rule $appName 'TCP' '38641' 'Any' $program) -ne 'ready') {
      throw 'rule_conflict'
    }
    foreach ($name in @($dnsName, $appName)) {
      if ($null -ne (Read-Rule $name)) { Remove-NetFirewallRule -PolicyStore PersistentStore -Name $name }
    }
    $result = @{ status = 'removed' }
  }
  $result | ConvertTo-Json -Compress
  if ($Action -eq 'Remove' -and $result.status -ne 'removed') { exit 1 }
} catch {
  @{ status = 'unavailable' } | ConvertTo-Json -Compress
  exit 1
}
