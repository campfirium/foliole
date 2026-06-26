param(
  [string]$TargetSerial = "",
  [string]$ScrcpyPath = ""
)

$ErrorActionPreference = "Stop"

function Write-Info {
  param([string]$Message)
  Write-Host "[android-control] $Message"
}

function Resolve-ScrcpyPath {
  param([string]$PreferredPath)

  $candidates = @(
    $PreferredPath,
    $env:SCRCPY_PATH
  ) | Where-Object { $_ -and $_.Trim().Length -gt 0 }

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  $command = Get-Command scrcpy.exe -ErrorAction SilentlyContinue
  if ($null -ne $command) {
    return $command.Source
  }

  $scoopCandidate = Join-Path $env:USERPROFILE "scoop\shims\scrcpy.exe"
  if (Test-Path -LiteralPath $scoopCandidate) {
    return $scoopCandidate
  }

  $localCandidate = "C:\tmp\scrcpy\scrcpy-win64-v3.3.4\scrcpy.exe"
  if (Test-Path -LiteralPath $localCandidate) {
    return $localCandidate
  }

  throw "scrcpy.exe not found. Install scrcpy or set SCRCPY_PATH."
}

$scrcpy = Resolve-ScrcpyPath -PreferredPath $ScrcpyPath
$serial = $TargetSerial
if ([string]::IsNullOrWhiteSpace($serial)) {
  $serial = $env:FOLIOLE_ANDROID_SERIAL
}
if ([string]::IsNullOrWhiteSpace($serial)) {
  $serial = $env:ANDROID_SERIAL
}

$arguments = @("--stay-awake")
if (![string]::IsNullOrWhiteSpace($serial)) {
  $arguments = @("--serial", $serial) + $arguments
  Write-Info "device: $serial"
} else {
  Write-Info "device: auto"
}

Start-Process `
  -FilePath $scrcpy `
  -ArgumentList $arguments `
  -WindowStyle Normal
Write-Info "status: OPENED"
