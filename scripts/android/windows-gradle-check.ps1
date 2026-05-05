param(
  [string]$WindowsWorkDir = "C:\dev\foliole-android-preview",
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

function Resolve-SdkRoot {
  $candidates = @(
    $env:ANDROID_SDK_ROOT,
    $env:ANDROID_HOME,
    "$env:LOCALAPPDATA\Android\Sdk"
  ) | Where-Object { $_ -and $_.Trim().Length -gt 0 }

  foreach ($candidate in $candidates) {
    if (Test-Path -Path $candidate) {
      return $candidate
    }
  }

  throw "Android SDK not found. Install Android SDK first."
}

function Invoke-GradleWrapper {
  param(
    [string]$TaskName
  )

  $gradleCommand = "call .\gradlew.bat $TaskName"
  & cmd.exe /d /c $gradleCommand
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

$javaHome = Resolve-JavaHome
$sdkRoot = Resolve-SdkRoot
$env:JAVA_HOME = $javaHome
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:Path = "$javaHome\bin;$env:Path"

$androidDir = Join-Path $WindowsWorkDir $AndroidHostDir
if (!(Test-Path -Path $androidDir)) {
  throw "Android host not initialized: $androidDir. Create the Capacitor Android host first."
}

Write-Info "workdir: $androidDir"
Write-Info "task: $TaskName"
Push-Location $androidDir
try {
  Invoke-GradleWrapper -TaskName $TaskName
} finally {
  Pop-Location
}

Write-Info "status: PASSED"
