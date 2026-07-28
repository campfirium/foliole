param(
  [Parameter(Mandatory = $true)][string]$DeviceIdentity,
  [Parameter(Mandatory = $true)][string]$JavaHome,
  [Parameter(Mandatory = $true)][string]$MacGitPublicKey,
  [Parameter(Mandatory = $true)][string]$MacPublicKey,
  [string]$DeviceEndpoint = "",
  [string]$AdbPath = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
  [string]$BashPath = "$env:ProgramFiles\Git\bin\bash.exe",
  [string]$GitPath = "$env:ProgramFiles\Git\cmd\git.exe",
  [string]$NodePath = "",
  [switch]$SkipKeyLockdown
)

$ErrorActionPreference = "Stop"
$installRoot = Join-Path $env:LOCALAPPDATA "Foliole\windows-android-lab"
$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

$releaseRoot = Join-Path $env:LOCALAPPDATA "Foliole\windows-device"
$nodePathFile = Join-Path $releaseRoot "node-path.txt"
if ([string]::IsNullOrWhiteSpace($NodePath) -and (Test-Path $nodePathFile)) { $NodePath = (Get-Content $nodePathFile -Raw).Trim() }
$nodeSourceRoot = Split-Path -Parent $NodePath
foreach ($tool in @($NodePath, $GitPath, $BashPath, $AdbPath, (Join-Path $JavaHome "bin\java.exe"), (Join-Path $nodeSourceRoot "npm.cmd"))) {
  if ([string]::IsNullOrWhiteSpace($tool) -or !(Test-Path -LiteralPath $tool -PathType Leaf)) { throw "Required Android Lab tool is missing: $tool" }
}
$files = @(& $NodePath (Join-Path $sourceRoot "windows-android-lab-runtime-manifest.mjs") --list)
if ($LASTEXITCODE -ne 0 -or $files.Count -lt 1) { throw "Failed to derive Windows Android Lab runtime manifest" }
if ($DeviceIdentity -notmatch '^[A-Za-z0-9._-]+$') { throw "DeviceIdentity contains unsupported characters" }
if ($DeviceEndpoint) {
  if ($DeviceEndpoint -notmatch '^(\d{1,3}\.){3}\d{1,3}:\d{1,5}$') { throw "DeviceEndpoint must be ipv4:port" }
  $endpointParts = $DeviceEndpoint.Split(':')
  $parsedIp = $null
  $parsedPort = 0
  if (-not [System.Net.IPAddress]::TryParse($endpointParts[0], [ref]$parsedIp) -or
      -not [int]::TryParse($endpointParts[1], [ref]$parsedPort) -or $parsedPort -lt 1 -or $parsedPort -gt 65535) {
    throw "DeviceEndpoint must be ipv4:port"
  }
  $readyDevices = @(& $AdbPath devices | Select-Object -Skip 1 | ForEach-Object {
    $parts = ($_ -split '\s+') | Where-Object { $_ }
    if ($parts.Count -ge 2 -and $parts[1] -eq "device") { $parts[0] }
  })
  if ($readyDevices.Count -ne 1 -or $readyDevices[0] -ne $DeviceEndpoint) {
    throw "Exactly one ready Android device must match DeviceEndpoint; found: $($readyDevices -join ',')"
  }
  $verifiedIdentity = (& $AdbPath -s $DeviceEndpoint shell getprop ro.serialno | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $verifiedIdentity -ne $DeviceIdentity) { throw "Stable Android device identity mismatch" }
}

New-Item -ItemType Directory -Force -Path $installRoot | Out-Null
foreach ($file in $files) { Copy-Item (Join-Path $sourceRoot $file) (Join-Path $installRoot $file) -Force }
$runtimeRoot = Join-Path $installRoot "runtime"
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
$labNodePath = Join-Path $runtimeRoot "node.exe"
Copy-Item (Join-Path $nodeSourceRoot "*") $runtimeRoot -Recurse -Force
& $NodePath (Join-Path $sourceRoot "windows-android-lab-git-repositories.mjs") --root $installRoot --git-path $GitPath
if ($LASTEXITCODE -ne 0) { throw "Failed to configure Android Lab Git repositories" }
Remove-Item (Join-Path $installRoot "git-read-token.txt"), (Join-Path $installRoot "git-askpass.cmd") -Force -ErrorAction SilentlyContinue
$existingConfigPath = Join-Path $installRoot "config.json"
$existingConfig = if (Test-Path $existingConfigPath) { Get-Content $existingConfigPath -Raw | ConvertFrom-Json } else { $null }
$config = @{
  adbPath = $AdbPath
  bashPath = $BashPath
  deviceIdentity = $DeviceIdentity
  gitPath = $GitPath
  javaHome = $JavaHome
  nodeDirectory = $runtimeRoot
  schemaVersion = 2
}
if ($existingConfig.adbServerPort -match '^[1-9][0-9]{1,4}$') {
  $config.adbServerPort = $existingConfig.adbServerPort
}
if ($existingConfig.androidDebugKeystoreSha256 -match '^[0-9a-f]{64}$') {
  $config.androidDebugKeystoreSha256 = $existingConfig.androidDebugKeystoreSha256
}
$config | ConvertTo-Json | Set-Content -Path $existingConfigPath -Encoding UTF8
if ($DeviceEndpoint) {
  $device = @{
    discoverySource = "installer"
    endpoint = $DeviceEndpoint
    identity = $DeviceIdentity
    schemaVersion = 1
    verifiedAt = [DateTime]::UtcNow.ToString("o")
  }
  $device | ConvertTo-Json | Set-Content -Path (Join-Path $installRoot "device.json") -Encoding UTF8
}
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
  $receiver = Join-Path $installRoot "windows-android-lab-receive.mjs"
  $forced = "command=`"$labNodePath $dispatcher`",no-agent-forwarding,no-port-forwarding,no-pty,no-user-rc $MacPublicKey"
  $gitForced = "command=`"$labNodePath $receiver`",no-agent-forwarding,no-port-forwarding,no-pty,no-user-rc $MacGitPublicKey"
  $existing = if (Test-Path $authorizedKeys) { Get-Content $authorizedKeys } else { @() }
  $bodies = @(($MacPublicKey -split "\s+")[1], ($MacGitPublicKey -split "\s+")[1])
  $retained = @($existing | Where-Object {
    $line = $_
    -not ($bodies | Where-Object { $line -match [regex]::Escape($_) })
  })
  Set-Content -Path $authorizedKeys -Value @($retained + $forced + $gitForced)
  if ($isAdmin) {
    icacls.exe $authorizedKeys /inheritance:r /grant "*S-1-5-32-544:F" /grant "SYSTEM:F" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to secure Android Lab authorized_keys" }
  }
}

$account = [System.Security.Principal.NTAccount]::new($identity)
$sid = $account.Translate([System.Security.Principal.SecurityIdentifier]).Value
icacls.exe $installRoot /inheritance:r /grant "*${sid}:(OI)(CI)F" /grant "*S-1-5-32-544:(OI)(CI)F" /grant "SYSTEM:(OI)(CI)F" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Failed to secure Android Lab install root" }
$endpointLabel = if ($DeviceEndpoint) { $DeviceEndpoint } else { "pending reconnect" }
Write-Host "Foliole Android Lab installed at $installRoot for device $DeviceIdentity ($endpointLabel)"
