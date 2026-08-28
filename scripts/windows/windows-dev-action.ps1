param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern("^[a-z]+(?:-[a-z]+)*$")]
  [string]$Action,
  [ValidatePattern("^group-[0-9a-f-]{36}$")]
  [string]$ExpectedGroupId = "",
  [string]$ExpectedGroupTag = ""
)

$ErrorActionPreference = "Stop"
$systemNode = "C:\Program Files\nodejs\node.exe"
$systemNpmCli = "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js"
$puller = Join-Path $PSScriptRoot "windows-dev-pull.mjs"
$runner = Join-Path $PSScriptRoot "windows-dev-build.mjs"
$internalOpenRunner = Join-Path $PSScriptRoot "windows-internal-open.mjs"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$releaseRunner = Join-Path $PSScriptRoot "windows-sync-group-provider-release-control.mjs"
$lockPath = Join-Path $env:LOCALAPPDATA "Foliole\windows-dev-control\build.lock"
$lockDirectory = Split-Path -Parent $lockPath

if (-not (Test-Path -LiteralPath $systemNode -PathType Leaf)) {
  [Console]::Error.WriteLine("System Node is missing at $systemNode")
  exit 64
}

$releaseStatus = switch ($Action) {
  "multi-device-sync-provider-complete" { "consumer_complete" }
  "multi-device-sync-provider-cancel" { "cancelled" }
  default { $null }
}
if ($null -ne $releaseStatus) {
  & $systemNode $releaseRunner $releaseStatus
  exit $LASTEXITCODE
}

New-Item -ItemType Directory -Force -Path $lockDirectory | Out-Null
try {
  $lock = [System.IO.File]::Open(
    $lockPath,
    [System.IO.FileMode]::OpenOrCreate,
    [System.IO.FileAccess]::ReadWrite,
    [System.IO.FileShare]::None
  )
} catch [System.IO.IOException] {
  [Console]::Error.WriteLine("Another Windows DEV action owns the foreground slot.")
  exit 73
}

try {
  $env:FOLIOLE_WINDOWS_DEV_LOCK_OWNER = [string]$PID
  if ($ExpectedGroupId) {
    $env:FOLIOLE_T152_EXPECTED_GROUP_ID = $ExpectedGroupId
    $env:FOLIOLE_T152_EXPECTED_GROUP_TAG = $ExpectedGroupTag
  } else {
    Remove-Item Env:FOLIOLE_T152_EXPECTED_GROUP_ID -ErrorAction SilentlyContinue
    Remove-Item Env:FOLIOLE_T152_EXPECTED_GROUP_TAG -ErrorAction SilentlyContinue
  }
  & $systemNode $puller
  $runnerExit = $LASTEXITCODE
  if ($runnerExit -eq 0) {
    if ($Action -eq "desktop-preview") {
      Push-Location $repoRoot
      try {
        & $systemNode $systemNpmCli run windows:preview:native
        $runnerExit = $LASTEXITCODE
      } finally {
        Pop-Location
      }
    } elseif ($Action -eq "internal-install") {
      Push-Location $repoRoot
      try {
        & $systemNode $systemNpmCli run windows:package:internal:install
        $runnerExit = $LASTEXITCODE
      } finally {
        Pop-Location
      }
    } elseif ($Action -eq "internal-open") {
      & $systemNode $internalOpenRunner
      $runnerExit = $LASTEXITCODE
    } else {
      & $systemNode $runner $Action
      $runnerExit = $LASTEXITCODE
    }
  }
} finally {
  $lock.Dispose()
}
exit $runnerExit
