param(
  [string]$WindowsWorkDir = "C:\dev\foliole",
  [string]$Config = "playwright.desktop.config.ts",
  [string]$BuildCommand = "npm.cmd run build",
  [string]$CompileCommand = "npm.cmd run electron:compile",
  [switch]$SkipBuild,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$PlaywrightArgs = @()
)

$ErrorActionPreference = "Stop"

function Write-Info {
  param([string]$Message)
  Write-Host "[windows-desktop-test] $Message"
}

if (!(Test-Path -Path $WindowsWorkDir)) {
  throw "windows workdir not found: $WindowsWorkDir"
}

$playwrightBin = Join-Path $WindowsWorkDir "node_modules\.bin\playwright.cmd"
if (!(Test-Path -Path $playwrightBin)) {
  throw "playwright binary not found: $playwrightBin"
}

$previousAppRoot = $env:FOLIOLE_ELECTRON_APP_ROOT
$previousWindowsWorkDir = $env:FOLIOLE_WINDOWS_WORKDIR

Push-Location $WindowsWorkDir
try {
  $env:FOLIOLE_ELECTRON_APP_ROOT = $WindowsWorkDir
  $env:FOLIOLE_WINDOWS_WORKDIR = $WindowsWorkDir
  if (-not $SkipBuild) {
    Write-Info "build command=$BuildCommand"
    cmd.exe /d /c $BuildCommand
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
    Write-Info "compile command=$CompileCommand"
    cmd.exe /d /c $CompileCommand
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  }
  $commandArgs = @("test", "--config", $Config) + $PlaywrightArgs
  Write-Info "workdir=$WindowsWorkDir"
  Write-Info "playwright=$($commandArgs -join ' ')"
  & $playwrightBin @commandArgs
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
