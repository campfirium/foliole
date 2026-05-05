param(
  [string]$WindowsWorkDir = "C:\dev\foliole"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Info {
  param([string]$Message)
  Write-Host "[windows-tauri-stable] $Message"
}

Write-Info "start direct dev flow"
Write-Info "workdir=$WindowsWorkDir"

Set-Location -Path $WindowsWorkDir
Write-Info "env unchanged (no sandbox/gpu overrides)"
Write-Info "status: STARTED"
cmd.exe /d /c "npm run tauri:dev"
