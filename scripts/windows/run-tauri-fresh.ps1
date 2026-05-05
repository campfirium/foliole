param(
  [string]$WindowsWorkDir = "C:\dev\foliole",
  [switch]$DiagSolid,
  [switch]$SoftwareOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-FreePort {
  param(
    [int]$Start = 4600,
    [int]$End = 4900
  )

  for ($attempt = 0; $attempt -lt 120; $attempt++) {
    $port = Get-Random -Minimum $Start -Maximum ($End + 1)
    $inUse = Get-NetTCPConnection -LocalAddress "127.0.0.1" -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if (-not $inUse) {
      return $port
    }
  }

  throw "No free port found in range $Start-$End."
}

if (-not (Test-Path $WindowsWorkDir)) {
  throw "Windows workdir not found: $WindowsWorkDir"
}

$port = Get-FreePort
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$udfRoot = Join-Path $WindowsWorkDir ".wv2"
$udf = Join-Path $udfRoot ($timestamp + "-" + $port)
$configSource = Join-Path $WindowsWorkDir "src-tauri\tauri.conf.json"
$configTemp = Join-Path $env:TEMP ("foliole-tauri-fresh-" + $timestamp + "-" + $port + ".json")
$logDir = Join-Path $WindowsWorkDir "logs\windows"
$logPath = Join-Path $logDir ("tauri-fresh-" + $timestamp + "-" + $port + ".log")

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
New-Item -ItemType Directory -Force -Path $udfRoot | Out-Null
New-Item -ItemType Directory -Force -Path $udf | Out-Null

# Verify UDF path is writable before launch to avoid opaque WebView2 startup errors.
$udfProbe = Join-Path $udf ".write-probe"
"ok" | Out-File -FilePath $udfProbe -Encoding ascii -Force
Remove-Item -Path $udfProbe -Force

$config = Get-Content -Path $configSource -Raw | ConvertFrom-Json
$config.build.beforeDevCommand = "npm run dev -- --host 127.0.0.1 --port $port"
$devUrl = "http://127.0.0.1:$port/"
if ($DiagSolid) {
  $devUrl = "${devUrl}?diag=solid"
}
$config.build.devUrl = $devUrl
$config | ConvertTo-Json -Depth 20 | Out-File -FilePath $configTemp -Encoding utf8

$envPrefix = "set `"WEBVIEW2_USER_DATA_FOLDER=$udf`""
if ($SoftwareOnly) {
  $envPrefix = $envPrefix + " && set `"WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--disable-gpu --disable-gpu-compositing`""
}

$launchCommand = "cd /d `"$WindowsWorkDir`" && $envPrefix && npm run tauri:dev -- --config `"$configTemp`""
$proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/k", $launchCommand -PassThru

$result = [ordered]@{
  status = "STARTED"
  launcher_pid = $proc.Id
  port = $port
  dev_url = $devUrl
  webview2_user_data_folder = $udf
  software_only = [bool]$SoftwareOnly
  temp_config = $configTemp
  log_path = $logPath
}

$result | ConvertTo-Json
