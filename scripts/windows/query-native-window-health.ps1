param(
  [Parameter(Mandatory = $true)]
  [int]$RuntimePid
)

$ErrorActionPreference = "Stop"
$process = Get-Process -Id $RuntimePid -ErrorAction SilentlyContinue
if ($null -eq $process) {
  @{ ok = $false; reason = "runtime-missing"; runtimePid = $RuntimePid } | ConvertTo-Json -Compress
  exit 0
}

$windowHandle = [int64]$process.MainWindowHandle
$responding = [bool]$process.Responding
if ($windowHandle -eq 0) {
  @{ ok = $false; reason = "window-missing"; runtimePid = $RuntimePid; responding = $responding; windowHandle = $windowHandle } | ConvertTo-Json -Compress
  exit 0
}
if (-not $responding) {
  @{ ok = $false; reason = "window-not-responding"; runtimePid = $RuntimePid; responding = $responding; windowHandle = $windowHandle } | ConvertTo-Json -Compress
  exit 0
}

@{ ok = $true; runtimePid = $RuntimePid; responding = $responding; windowHandle = $windowHandle } | ConvertTo-Json -Compress
