param(
  [string]$WindowsWorkDir = "C:\dev\foliole",
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

if (!(Test-Path -Path $WindowsWorkDir)) {
  throw "windows workdir not found: $WindowsWorkDir"
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
