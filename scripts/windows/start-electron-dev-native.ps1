param(
  [Parameter(Mandatory=$true)]
  [string]$NodePath,

  [Parameter(Mandatory=$true)]
  [string]$WorkDir,

  [Parameter(Mandatory=$true)]
  [string]$Session,

  [Parameter(Mandatory=$true)]
  [string]$RuntimeHead,

  [Parameter(Mandatory=$true)]
  [string]$StdoutLog,

  [Parameter(Mandatory=$true)]
  [string]$StderrLog
)

$previousSession = $env:FOLIOLE_BOOT_SESSION
$previousRuntimeHead = $env:FOLIOLE_RUNTIME_HEAD

try {
  $env:FOLIOLE_BOOT_SESSION = $Session
  $env:FOLIOLE_RUNTIME_HEAD = $RuntimeHead
  $scriptPath = Join-Path $WorkDir "scripts\windows\electron-dev-native.mjs"
  $launchCommand = '/d /c ""' + $NodePath + '" "' + $scriptPath + '""'
  $started = Start-Process `
    -FilePath "cmd.exe" `
    -ArgumentList $launchCommand `
    -WorkingDirectory $WorkDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $StdoutLog `
    -RedirectStandardError $StderrLog `
    -PassThru `
    -ErrorAction Stop
  Write-Output "[windows-native-start] shell_pid=$($started.Id)"
} finally {
  $env:FOLIOLE_BOOT_SESSION = $previousSession
  $env:FOLIOLE_RUNTIME_HEAD = $previousRuntimeHead
}
