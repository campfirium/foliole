param(
  [string]$WindowsWorkDir = "D:\C\foliole",
  [Parameter(Mandatory = $true)]
  [string]$ScriptPath,
  [string[]]$NodeArgs = @()
)

$ErrorActionPreference = "Stop"

function Resolve-RepoScriptPath {
  param(
    [string]$BaseDir,
    [string]$CandidatePath
  )

  if ([System.IO.Path]::IsPathRooted($CandidatePath)) {
    return [System.IO.Path]::GetFullPath($CandidatePath)
  }

  return [System.IO.Path]::GetFullPath((Join-Path $BaseDir $CandidatePath))
}

function Test-IsBlockedNativeNodeScript {
  param([string]$CandidatePath)

  $normalized = $CandidatePath.Replace('\', '/').TrimStart('./')
  $blockedScripts = @(
    "scripts/backfill-node-opening-text.ts",
    "scripts/backfill-source-disposition-states.ts",
    "scripts/node-kind-report.ts",
    "scripts/sqlite-maintenance.ts",
    "scripts/android/android-device-data-protection.mjs",
    "scripts/android/android-preview-sync-state.mjs",
    "scripts/android/android-reset-sync-data.mjs",
    "scripts/android/android-sync-audit.mjs",
    "scripts/android/android-sync-cleanup-device-private.mjs",
    "scripts/android/android-sync-scenario-sampler.mjs"
  )

  return $blockedScripts -contains $normalized
}

if (!(Test-Path -Path $WindowsWorkDir)) {
  throw "windows workdir not found: $WindowsWorkDir"
}

if (Test-IsBlockedNativeNodeScript -CandidatePath $ScriptPath) {
  throw "refusing to run native sqlite script with plain Windows Node: $ScriptPath; use an Electron-as-Node entrypoint or restore the Electron native ABI before preview"
}

$resolvedScriptPath = Resolve-RepoScriptPath -BaseDir $WindowsWorkDir -CandidatePath $ScriptPath
if (!(Test-Path -Path $resolvedScriptPath)) {
  throw "node script not found: $resolvedScriptPath"
}

$previousAppRoot = $env:FOLIOLE_ELECTRON_APP_ROOT
$previousWindowsWorkDir = $env:FOLIOLE_WINDOWS_WORKDIR

Push-Location $WindowsWorkDir
try {
  $env:FOLIOLE_ELECTRON_APP_ROOT = $WindowsWorkDir
  $env:FOLIOLE_WINDOWS_WORKDIR = $WindowsWorkDir
  & node $resolvedScriptPath @NodeArgs
  exit $LASTEXITCODE
} finally {
  if ($null -eq $previousAppRoot) {
    Remove-Item Env:FOLIOLE_ELECTRON_APP_ROOT -ErrorAction SilentlyContinue
  } else {
    $env:FOLIOLE_ELECTRON_APP_ROOT = $previousAppRoot
  }
  if ($null -eq $previousWindowsWorkDir) {
    Remove-Item Env:FOLIOLE_WINDOWS_WORKDIR -ErrorAction SilentlyContinue
  } else {
    $env:FOLIOLE_WINDOWS_WORKDIR = $previousWindowsWorkDir
  }
  Pop-Location
}
