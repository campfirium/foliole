param(
  [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA "Foliole\windows-android-lab")
)

$ErrorActionPreference = "Stop"
$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$files = @(
  "windows-bounded-process.mjs",
  "windows-android-lab-checkout.mjs",
  "windows-android-lab-dispatcher.mjs",
  "windows-android-lab-device.mjs",
  "windows-android-lab-evidence.mjs",
  "windows-android-lab-operation.mjs",
  "windows-android-lab-request.mjs",
  "windows-android-lab-review-action.mjs",
  "windows-android-lab-review-audit.ts",
  "windows-android-lab-review-scenario.mjs",
  "windows-android-lab-review-snapshot.mjs",
  "windows-android-lab-receive.mjs",
  "windows-android-lab-selfcheck.mjs",
  "windows-android-lab-state.mjs",
  "windows-android-lab-worker.mjs"
)

if (!(Test-Path -LiteralPath $InstallRoot -PathType Container)) {
  throw "Windows Android Lab install root is missing: $InstallRoot"
}

foreach ($file in $files) {
  $source = Join-Path $sourceRoot $file
  $target = Join-Path $InstallRoot $file
  if (!(Test-Path -LiteralPath $source -PathType Leaf)) {
    throw "Windows Android Lab runtime source is missing: $source"
  }
  Copy-Item -LiteralPath $source -Destination $target -Force
}

$configPath = Join-Path $InstallRoot "config.json"
if (!(Test-Path -LiteralPath $configPath -PathType Leaf)) {
  throw "Windows Android Lab config is missing: $configPath"
}
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$nodePath = Join-Path $config.nodeDirectory "node.exe"
if (!(Test-Path -LiteralPath $nodePath -PathType Leaf)) {
  throw "Windows Android Lab node runtime is missing: $nodePath"
}
& $nodePath --check (Join-Path $InstallRoot "windows-android-lab-worker.mjs")
if ($LASTEXITCODE -ne 0) { throw "Windows Android Lab worker syntax check failed." }
& $nodePath --check (Join-Path $InstallRoot "windows-android-lab-dispatcher.mjs")
if ($LASTEXITCODE -ne 0) { throw "Windows Android Lab dispatcher syntax check failed." }

Write-Host "[windows-android-lab-update-runtime] status: UPDATED files=$($files.Count)"
