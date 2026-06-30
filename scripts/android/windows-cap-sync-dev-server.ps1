param(
  [string]$WindowsWorkDir = "C:\dev\foliole-android-preview",
  [string]$AndroidHostDir = "android",
  [string]$ServerUrl = "http://127.0.0.1:24604"
)

$ErrorActionPreference = "Stop"

function Write-Info {
  param([string]$Message)
  Write-Host "[android-dev-server-sync] $Message"
}

function Invoke-NodeTool {
  param(
    [string[]]$Arguments,
    [string]$FailureMessage
  )
  $nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($null -eq $nodeCmd) {
    throw "node.exe not found on Windows. Install Node.js on Windows first."
  }
  $process = Start-Process -FilePath $nodeCmd.Source -ArgumentList $Arguments -Wait -PassThru -WindowStyle Hidden -WorkingDirectory $WindowsWorkDir
  if ($process.ExitCode -ne 0) {
    throw $FailureMessage
  }
}

function Write-DevServerConfig {
  param([string]$ConfigPath, [string]$Url)

  $source = Get-Content -Path $ConfigPath -Raw
  if ($source -match "(?m)^\s*server\s*:") {
    throw "Capacitor config already contains a server block; refusing to overwrite it."
  }
  if ($source -notmatch "(?m)^  webDir:") {
    throw "Cannot find webDir in Capacitor config."
  }
  $serverBlock = "  server: {`r`n    url: '$Url',`r`n    cleartext: true`r`n  },`r`n  webDir:"
  $source -replace "(?m)^  webDir:", $serverBlock | Set-Content -Path $ConfigPath -Encoding UTF8
}

$androidDir = Join-Path $WindowsWorkDir $AndroidHostDir
$configPath = Join-Path $WindowsWorkDir "capacitor.config.ts"
$capCliPath = Join-Path $WindowsWorkDir "node_modules\@capacitor\cli\bin\capacitor"
$runtimeDir = Join-Path $WindowsWorkDir ".lab\internal\runtime"
$backupPath = Join-Path $runtimeDir "capacitor.config.dev-server-preview.bak"
$syncedConfigPath = Join-Path $androidDir "app\src\main\assets\capacitor.config.json"

if (!(Test-Path -Path $androidDir)) {
  throw "Android host not initialized: $androidDir."
}
if (!(Test-Path -Path $configPath -PathType Leaf)) {
  throw "Capacitor config not found: $configPath."
}
if (!(Test-Path -Path $capCliPath -PathType Leaf)) {
  throw "Capacitor CLI missing in Windows mirror: $capCliPath."
}

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
Copy-Item -Path $configPath -Destination $backupPath -Force

Push-Location $WindowsWorkDir
try {
  Write-Info "server url: $ServerUrl"
  Write-DevServerConfig -ConfigPath $configPath -Url $ServerUrl
  Invoke-NodeTool -Arguments @($capCliPath, "sync", "android") -FailureMessage "Capacitor Android dev-server sync failed."
  if (!(Test-Path -Path $syncedConfigPath -PathType Leaf)) {
    throw "Synced Android Capacitor config missing: $syncedConfigPath."
  }
  $synced = Get-Content -Path $syncedConfigPath -Raw | ConvertFrom-Json
  if ($synced.server.url -ne $ServerUrl -or $synced.server.cleartext -ne $true) {
    throw "Synced Android config does not point to $ServerUrl."
  }
  Write-Info "status: SYNCED"
} finally {
  Copy-Item -Path $backupPath -Destination $configPath -Force
  Pop-Location
}
