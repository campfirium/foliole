param(
  [string]$WindowsWorkDir = "C:\dev\foliole-android-preview",
  [string]$AndroidHostDir = "android"
)

$ErrorActionPreference = "Stop"

function Write-Info {
  param([string]$Message)
  Write-Host "[android-open] $Message"
}

$androidDir = Join-Path $WindowsWorkDir $AndroidHostDir
if (!(Test-Path -Path $androidDir)) {
  throw "Android host not initialized: $androidDir. Create the Capacitor Android host first."
}

$studioCandidates = @(
  "$env:ProgramFiles\Android\Android Studio\bin\studio64.exe",
  "$env:ProgramFiles\Android\Android Studio\bin\studio.exe",
  "$env:LOCALAPPDATA\Programs\Android Studio\bin\studio64.exe",
  "$env:LOCALAPPDATA\Programs\Android Studio\bin\studio.exe"
) | Where-Object { $_ -and (Test-Path -Path $_) }

if ($studioCandidates.Count -eq 0) {
  throw "Android Studio not found. Install Android Studio on Windows first."
}

$studioPath = $studioCandidates[0]
Write-Info "opening: $androidDir"
Start-Process -FilePath $studioPath -ArgumentList "`"$androidDir`""
Write-Info "status: OPENED"
