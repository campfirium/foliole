param()

$ErrorActionPreference = "Stop"

function Write-Info {
  param([string]$Message)
  Write-Host "[windows-electron-stable] $Message"
}

$repoRoot = Resolve-Path "$PSScriptRoot\..\.."
Set-Location $repoRoot
Write-Info "cwd=$repoRoot"
Write-Info "running: npm run electron:dev"
cmd.exe /d /c "npm run electron:dev"
