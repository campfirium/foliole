param(
  [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA "Foliole\windows-android-lab")
)

$ErrorActionPreference = "Stop"
$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$files = @(
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

Write-Host "[windows-android-lab-update-runtime] status: UPDATED"
