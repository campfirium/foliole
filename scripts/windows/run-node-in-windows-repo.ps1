param(
  [string]$WindowsWorkDir = "D:\C\foliole",
  [Parameter(Mandatory = $true)]
  [string]$ScriptPath,
  [string]$RuntimeHead = "",
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

function Resolve-NodeExecutable {
  $candidates = @(
    $env:FOLIOLE_WINDOWS_NODE_EXE,
    (Join-Path $env:NVM_SYMLINK 'node.exe'),
    (Join-Path $env:ProgramFiles 'nodejs\node.exe')
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

  foreach ($candidate in $candidates) {
    if (Test-Path -Path $candidate) {
      return $candidate
    }
  }

  $command = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($null -ne $command) {
    return $command.Source
  }

  throw "node.exe not found; set FOLIOLE_WINDOWS_NODE_EXE or fix NVM_SYMLINK/PATH"
}

function Format-ProcessArgument {
  param([string]$Value)
  if ($null -eq $Value) {
    return '""'
  }
  return '"' + $Value.Replace('"', '\"') + '"'
}

function Invoke-NodeScript {
  param(
    [string]$NodePath,
    [string]$ResolvedScriptPath,
    [string[]]$Arguments
  )

  $stdoutLog = [System.IO.Path]::GetTempFileName()
  $stderrLog = [System.IO.Path]::GetTempFileName()
  $argumentList = @((Format-ProcessArgument -Value $ResolvedScriptPath)) +
    @($Arguments | ForEach-Object { Format-ProcessArgument -Value $_ })
  try {
    $process = Start-Process `
      -FilePath $NodePath `
      -ArgumentList $argumentList `
      -WorkingDirectory (Get-Location).Path `
      -RedirectStandardOutput $stdoutLog `
      -RedirectStandardError $stderrLog `
      -NoNewWindow `
      -Wait `
      -PassThru
    Get-Content -Path $stdoutLog -Raw -ErrorAction SilentlyContinue | Write-Output
    Get-Content -Path $stderrLog -Raw -ErrorAction SilentlyContinue | Write-Error
    $script:NodeScriptExitCode = $process.ExitCode
  } finally {
    Remove-Item -Path $stdoutLog -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $stderrLog -Force -ErrorAction SilentlyContinue
  }
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
$previousRuntimeHead = $env:FOLIOLE_RUNTIME_HEAD
$nodePath = Resolve-NodeExecutable

Push-Location $WindowsWorkDir
try {
  $env:FOLIOLE_ELECTRON_APP_ROOT = $WindowsWorkDir
  $env:FOLIOLE_WINDOWS_WORKDIR = $WindowsWorkDir
  if (-not [string]::IsNullOrWhiteSpace($RuntimeHead)) {
    $env:FOLIOLE_RUNTIME_HEAD = $RuntimeHead
  }
  $script:NodeScriptExitCode = 0
  Invoke-NodeScript -NodePath $nodePath -ResolvedScriptPath $resolvedScriptPath -Arguments $NodeArgs
  exit $script:NodeScriptExitCode
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
  if ($null -eq $previousRuntimeHead) {
    Remove-Item Env:FOLIOLE_RUNTIME_HEAD -ErrorAction SilentlyContinue
  } else {
    $env:FOLIOLE_RUNTIME_HEAD = $previousRuntimeHead
  }
  Pop-Location
}
