function Resolve-WindowVisibleMarkerPath {
  param([string]$WorkDir)
  return Join-Path $WorkDir ".windows-native-window-visible.json"
}

function Get-WindowVisibleEvent {
  param([string]$WorkDir)

  $markerPath = Resolve-WindowVisibleMarkerPath -WorkDir $WorkDir
  if (!(Test-Path -Path $markerPath)) {
    return $null
  }

  try {
    $event = Get-Content -Path $markerPath -Raw | ConvertFrom-Json
    if ($null -eq $event) {
      return $null
    }
    if ("$($event.stage)".Trim() -ne "window_visible") {
      return $null
    }
    return $event
  } catch {
    return $null
  }
}

function Test-RuntimeWindowVisible {
  param(
    [string]$WorkDir,
    [int]$RuntimePid,
    [string]$ExpectedSession = ""
  )

  if ($RuntimePid -le 0) {
    return @{ ok = $false; reason = "runtime-missing" }
  }

  $event = Get-WindowVisibleEvent -WorkDir $WorkDir
  if ($null -eq $event) {
    return @{ ok = $false; reason = "window-visible-missing" }
  }

  $windowMarkerPid = 0
  try {
    $windowMarkerPid = [int]$event.pid
  } catch {
    $windowMarkerPid = 0
  }

  $windowMarkerSession = ""
  if ($null -ne $event.session) {
    $windowMarkerSession = "$($event.session)".Trim()
  }

  if ($windowMarkerPid -ne $RuntimePid) {
    return @{ ok = $false; reason = "window-visible-pid-mismatch"; windowMarkerPid = $windowMarkerPid; windowMarkerSession = $windowMarkerSession }
  }
  if (-not [string]::IsNullOrWhiteSpace($ExpectedSession) -and $windowMarkerSession -ne $ExpectedSession) {
    return @{ ok = $false; reason = "window-visible-session-mismatch"; windowMarkerPid = $windowMarkerPid; windowMarkerSession = $windowMarkerSession }
  }

  $isVisible = $false
  try {
    if ($null -ne $event.payload) {
      $isVisible = [bool]$event.payload.isVisible
    }
  } catch {
    $isVisible = $false
  }
  if (-not $isVisible) {
    return @{ ok = $false; reason = "window-not-visible"; windowMarkerPid = $windowMarkerPid; windowMarkerSession = $windowMarkerSession }
  }

  return @{ ok = $true; windowMarkerPid = $windowMarkerPid; windowMarkerSession = $windowMarkerSession }
}

function Wait-WindowVisibleMarker {
  param(
    [string]$WorkDir,
    [int]$RuntimePid,
    [string]$ExpectedSession = "",
    [int]$MaxSeconds = 10
  )

  $markerPath = Resolve-WindowVisibleMarkerPath -WorkDir $WorkDir
  for ($second = 0; $second -lt $MaxSeconds; $second += 1) {
    $runtime = Get-ProcessById -ProcessId $RuntimePid
    if ($null -eq $runtime) {
      return @{ ok = $false; reason = "runtime-exited-before-window-visible" }
    }
    if (Test-Path -Path $markerPath) {
      $visibleState = Test-RuntimeWindowVisible -WorkDir $WorkDir -RuntimePid $RuntimePid -ExpectedSession $ExpectedSession
      if ($visibleState.ok) {
        return @{ ok = $true; runtimePid = $RuntimePid; windowMarkerSession = $visibleState.windowMarkerSession }
      }
      if ($visibleState.reason -ne "window-visible-missing") {
        return $visibleState
      }
    }
    Start-Sleep -Seconds 1
  }
  return @{ ok = $false; reason = "window-visible-timeout" }
}
