param(
  [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA "Foliole\windows-android-lab")
)

$ErrorActionPreference = "Stop"
$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

if (!(Test-Path -LiteralPath $InstallRoot -PathType Container)) {
  throw "Windows Android Lab install root is missing: $InstallRoot"
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
$files = @(& $nodePath (Join-Path $sourceRoot "windows-android-lab-runtime-manifest.mjs") --list)
if ($LASTEXITCODE -ne 0 -or $files.Count -lt 1) { throw "Failed to derive Windows Android Lab runtime manifest" }

$stagingRoot = Join-Path $InstallRoot ".runtime-update-staging-$PID"
$backupRoot = Join-Path $InstallRoot ".runtime-update-backup-$PID"
Remove-Item -LiteralPath $stagingRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $stagingRoot | Out-Null
foreach ($file in $files) {
  $source = Join-Path $sourceRoot $file
  $target = Join-Path $stagingRoot $file
  if (!(Test-Path -LiteralPath $source -PathType Leaf)) { throw "Windows Android Lab runtime source is missing: $source" }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
  Copy-Item -LiteralPath $source -Destination $target -Force
}
foreach ($file in @(
  "windows-android-lab-dispatcher.mjs",
  "windows-android-lab-receive.mjs",
  "windows-android-lab-runtime-update.mjs",
  "windows-android-lab-selfcheck.mjs",
  "windows-android-lab-worker.mjs"
)) {
  & $nodePath --check (Join-Path $stagingRoot $file)
  if ($LASTEXITCODE -ne 0) { throw "Windows Android Lab runtime syntax check failed: $file" }
}

Remove-Item -LiteralPath $backupRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
foreach ($file in $files) {
  $target = Join-Path $InstallRoot $file
  $backup = Join-Path $backupRoot $file
  if (Test-Path -LiteralPath $target -PathType Leaf) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $backup) | Out-Null
    Move-Item -LiteralPath $target -Destination $backup -Force
  }
  Move-Item -LiteralPath (Join-Path $stagingRoot $file) -Destination $target -Force
}
Remove-Item -LiteralPath $stagingRoot -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "[windows-android-lab-update-runtime] status: UPDATED files=$($files.Count)"
