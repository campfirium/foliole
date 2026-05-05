param(
  [string]$WindowsWorkDir = "C:\dev\foliole",
  [string]$AndroidHostDir = "android",
  [Parameter(Mandatory = $true)]
  [string]$TaskName
)

$ErrorActionPreference = "Stop"

function Write-Info {
  param([string]$Message)
  Write-Host "[android-gradle-check] $Message"
}

function Resolve-JavaHome {
  $candidates = @(
    $env:JAVA_HOME,
    "$env:LOCALAPPDATA\Programs\Android Studio\jbr",
    "$env:ProgramFiles\Android\Android Studio\jbr"
  ) | Where-Object { $_ -and $_.Trim().Length -gt 0 }

  foreach ($candidate in $candidates) {
    if (Test-Path -Path (Join-Path $candidate "bin\java.exe")) {
      return $candidate
    }
  }

  throw "JAVA_HOME not found. Install Android Studio or configure a JDK."
}

$javaHome = Resolve-JavaHome
$env:JAVA_HOME = $javaHome
$env:Path = "$javaHome\bin;$env:Path"

$androidDir = Join-Path $WindowsWorkDir $AndroidHostDir
if (!(Test-Path -Path $androidDir)) {
  throw "Android host not initialized: $androidDir. Create the Capacitor Android host first."
}

Write-Info "workdir: $androidDir"
Write-Info "task: $TaskName"
Push-Location $androidDir
try {
  & ".\gradlew.bat" $TaskName
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
}

Write-Info "status: PASSED"
