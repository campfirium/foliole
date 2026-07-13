param(
  [string]$GitHubToken = "",
  [string]$MacPublicKey = "",
  [string]$NodePath = "",
  [switch]$SkipKeyLockdown,
  [switch]$SkipSystemSetup
)

$ErrorActionPreference = "Stop"
$installRoot = Join-Path $env:LOCALAPPDATA "Foliole\windows-device"
$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$files = @(
  "windows-device-artifact.mjs",
  "windows-device-dispatcher.mjs",
  "windows-device-state.mjs",
  "windows-device-worker.mjs"
)

$nodePathFile = Join-Path $installRoot "node-path.txt"
if ([string]::IsNullOrWhiteSpace($NodePath) -and (Test-Path $nodePathFile)) { $NodePath = Get-Content $nodePathFile -Raw }
if (-not (Test-Path $NodePath)) { throw "Node 22 was not found; run install-windows-device-runtime.ps1 first" }
if (-not $SkipSystemSetup) {
  if (-not (Get-Service -Name sshd -ErrorAction SilentlyContinue)) {
    & dism.exe /Online /Add-Capability /CapabilityName:OpenSSH.Server~~~~0.0.1.0
    if ($LASTEXITCODE -ne 0) { throw "DISM failed to install OpenSSH Server: exit $LASTEXITCODE" }
  }
  Set-Service -Name sshd -StartupType Automatic
  Start-Service sshd
  $firewall = Get-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -ErrorAction SilentlyContinue
  if (-not $firewall) {
    New-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -DisplayName "OpenSSH Server (sshd)" -Enabled True -Direction Inbound -Protocol TCP -LocalPort 22 -Action Allow -Profile Private | Out-Null
  } else {
    Set-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -Enabled True -Profile Private
  }
}
New-Item -ItemType Directory -Force -Path $installRoot | Out-Null
foreach ($file in $files) { Copy-Item (Join-Path $sourceRoot $file) (Join-Path $installRoot $file) -Force }
if ([string]::IsNullOrWhiteSpace($GitHubToken)) { $GitHubToken = [Console]::In.ReadToEnd().Trim() }
if ([string]::IsNullOrWhiteSpace($GitHubToken)) { throw "GitHub token is required" }
Set-Content -Path (Join-Path $installRoot "github-token.txt") -Value $GitHubToken -NoNewline

$action = New-ScheduledTaskAction -Execute $NodePath -Argument "`"$(Join-Path $installRoot 'windows-device-worker.mjs')`""
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "FoliolePhysicalAcceptance" -Action $action -Principal $principal -Settings $settings -Force | Out-Null

if (-not $SkipKeyLockdown) {
  if ([string]::IsNullOrWhiteSpace($MacPublicKey)) { throw "Mac public key is required for SSH lockdown" }
  $isAdministrator = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  $sshDirectory = if ($isAdministrator) { Join-Path $env:ProgramData "ssh" } else { Join-Path $env:USERPROFILE ".ssh" }
  $authorizedKeys = Join-Path $sshDirectory $(if ($isAdministrator) { "administrators_authorized_keys" } else { "authorized_keys" })
  New-Item -ItemType Directory -Force -Path $sshDirectory | Out-Null
  $dispatcher = Join-Path $installRoot "windows-device-dispatcher.mjs"
  $forcedCommand = "command=`"$NodePath $dispatcher`",no-agent-forwarding,no-port-forwarding,no-pty $MacPublicKey"
  $existing = if (Test-Path $authorizedKeys) { Get-Content $authorizedKeys } else { @() }
  $publicKeyBody = ($MacPublicKey -split "\s+")[1]
  $retained = @($existing | Where-Object { $_ -notmatch [regex]::Escape($publicKeyBody) })
  Set-Content -Path $authorizedKeys -Value @($retained + $forcedCommand)
  if ($isAdministrator) {
    icacls.exe $authorizedKeys /inheritance:r /grant "*S-1-5-32-544:F" /grant "SYSTEM:F" | Out-Null
  }
}

Write-Host "Foliole Windows device debug chain installed at $installRoot"
Write-Host "OpenSSH Server, private-profile firewall, forced SSH command, and interactive task are ready."
