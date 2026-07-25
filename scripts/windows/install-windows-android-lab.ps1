param(
  [Parameter(Mandatory = $true)][string]$DeviceEndpoint,
  [Parameter(Mandatory = $true)][string]$GitReadToken,
  [Parameter(Mandatory = $true)][string]$MacPublicKey,
  [string]$AdbPath = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
  [string]$BashPath = "$env:ProgramFiles\Git\bin\bash.exe",
  [string]$GitPath = "$env:ProgramFiles\Git\cmd\git.exe",
  [string]$NodePath = "",
  [string]$RepositoryUrl = "https://github.com/campfirium/foliole.git",
  [switch]$SkipKeyLockdown
)

$ErrorActionPreference = "Stop"
$installRoot = Join-Path $env:LOCALAPPDATA "Foliole\windows-android-lab"
$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$files = @(
  "windows-bounded-process.mjs",
  "windows-android-lab-dispatcher.mjs",
  "windows-android-lab-device.mjs",
  "windows-android-lab-git-askpass.mjs",
  "windows-android-lab-state.mjs",
  "windows-android-lab-worker.mjs"
)

$releaseRoot = Join-Path $env:LOCALAPPDATA "Foliole\windows-device"
$nodePathFile = Join-Path $releaseRoot "node-path.txt"
if ([string]::IsNullOrWhiteSpace($NodePath) -and (Test-Path $nodePathFile)) { $NodePath = (Get-Content $nodePathFile -Raw).Trim() }
foreach ($tool in @($NodePath, $GitPath, $BashPath, $AdbPath)) {
  if ([string]::IsNullOrWhiteSpace($tool) -or !(Test-Path -LiteralPath $tool -PathType Leaf)) { throw "Required Android Lab tool is missing: $tool" }
}
foreach ($command in @("npm.cmd", "java.exe")) {
  if ($null -eq (Get-Command $command -ErrorAction SilentlyContinue)) { throw "Required Android Lab command is missing from PATH: $command" }
}
if ($DeviceEndpoint -notmatch '^(\d{1,3}\.){3}\d{1,3}:\d{1,5}$') { throw "DeviceEndpoint must be ipv4:port" }
$endpointParts = $DeviceEndpoint.Split(':')
$parsedIp = $null
$parsedPort = 0
if (-not [System.Net.IPAddress]::TryParse($endpointParts[0], [ref]$parsedIp) -or
    -not [int]::TryParse($endpointParts[1], [ref]$parsedPort) -or $parsedPort -lt 1 -or $parsedPort -gt 65535) {
  throw "DeviceEndpoint must be ipv4:port"
}
if ([string]::IsNullOrWhiteSpace($GitReadToken)) { throw "A separate read-only Git token is required" }
$readyDevices = @(& $AdbPath devices | Select-Object -Skip 1 | ForEach-Object {
  $parts = ($_ -split '\s+') | Where-Object { $_ }
  if ($parts.Count -ge 2 -and $parts[1] -eq "device") { $parts[0] }
})
if ($readyDevices.Count -ne 1 -or $readyDevices[0] -ne $DeviceEndpoint) {
  throw "Exactly one ready Android device must match DeviceEndpoint; found: $($readyDevices -join ',')"
}
$deviceIdentity = (& $AdbPath -s $DeviceEndpoint shell getprop ro.serialno | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $deviceIdentity -notmatch '^[A-Za-z0-9._-]+$') { throw "Stable Android device identity is unavailable" }

New-Item -ItemType Directory -Force -Path $installRoot | Out-Null
foreach ($file in $files) { Copy-Item (Join-Path $sourceRoot $file) (Join-Path $installRoot $file) -Force }
$runtimeRoot = Join-Path $installRoot "runtime"
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
$labNodePath = Join-Path $runtimeRoot "node.exe"
Copy-Item $NodePath $labNodePath -Force
Set-Content -Path (Join-Path $installRoot "git-read-token.txt") -Value $GitReadToken -NoNewline
$config = @{
  adbPath = $AdbPath
  bashPath = $BashPath
  deviceIdentity = $deviceIdentity
  gitPath = $GitPath
  repositoryUrl = $RepositoryUrl
  schemaVersion = 2
}
$config | ConvertTo-Json | Set-Content -Path (Join-Path $installRoot "config.json") -Encoding UTF8
$device = @{
  discoverySource = "installer"
  endpoint = $DeviceEndpoint
  identity = $deviceIdentity
  schemaVersion = 1
  verifiedAt = [DateTime]::UtcNow.ToString("o")
}
$device | ConvertTo-Json | Set-Content -Path (Join-Path $installRoot "device.json") -Encoding UTF8
$askPass = "@echo off`r`n`"$labNodePath`" `"$(Join-Path $installRoot 'windows-android-lab-git-askpass.mjs')`" %*`r`n"
Set-Content -Path (Join-Path $installRoot "git-askpass.cmd") -Value $askPass -NoNewline

$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute $labNodePath -Argument "`"$(Join-Path $installRoot 'windows-android-lab-worker.mjs')`""
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 50)
Register-ScheduledTask -TaskName "FolioleAndroidLab" -Action $action -Principal $principal -Settings $settings -Force | Out-Null

if (-not $SkipKeyLockdown) {
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  $sshDirectory = if ($isAdmin) { Join-Path $env:ProgramData "ssh" } else { Join-Path $env:USERPROFILE ".ssh" }
  $authorizedKeys = Join-Path $sshDirectory $(if ($isAdmin) { "administrators_authorized_keys" } else { "authorized_keys" })
  New-Item -ItemType Directory -Force -Path $sshDirectory | Out-Null
  $dispatcher = Join-Path $installRoot "windows-android-lab-dispatcher.mjs"
  $forced = "command=`"$labNodePath $dispatcher`",no-agent-forwarding,no-port-forwarding,no-pty,no-user-rc $MacPublicKey"
  $existing = if (Test-Path $authorizedKeys) { Get-Content $authorizedKeys } else { @() }
  $body = ($MacPublicKey -split "\s+")[1]
  $retained = @($existing | Where-Object { $_ -notmatch [regex]::Escape($body) })
  Set-Content -Path $authorizedKeys -Value @($retained + $forced)
  if ($isAdmin) { icacls.exe $authorizedKeys /inheritance:r /grant "*S-1-5-32-544:F" /grant "SYSTEM:F" | Out-Null }
}

$account = [System.Security.Principal.NTAccount]::new($identity)
$sid = $account.Translate([System.Security.Principal.SecurityIdentifier]).Value
icacls.exe $installRoot /inheritance:r /grant "${sid}:(OI)(CI)F" /grant "*S-1-5-32-544:(OI)(CI)F" /grant "SYSTEM:(OI)(CI)F" | Out-Null
Write-Host "Foliole Android Lab installed at $installRoot for device $deviceIdentity at $DeviceEndpoint"
