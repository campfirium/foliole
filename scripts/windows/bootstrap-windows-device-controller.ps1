param()

$ErrorActionPreference = "Stop"
$revision = "fefdc91babe7dfdd28c58c4c46c83e1165a9748a"
$installRoot = Join-Path $env:LOCALAPPDATA "Foliole\windows-device"
$taskName = "FoliolePhysicalAcceptance"
$files = [ordered]@{
  "windows-bounded-process.mjs" = "8a33dbffad6d7f6fb23b5557db4836bc81f4c33f33147db399f342706e185962"
  "windows-device-artifact.mjs" = "4ca0d20272d469e9d3ddc04e76d535fe5ca13c163c1e8f3b57168ec276030658"
  "windows-device-state.mjs" = "3382f725af590cb1e683fdd96878c15f54970487933dece893d4fea27948137e"
  "windows-device-worker.mjs" = "3b17d60fbea0730bfa55d773c5c7fec7d0fa0d0c2ec635b3883441d6ce5a61c9"
  "windows-device-dispatcher.mjs" = "600cedf5ae10d43f0257291332358f91643b517f7c00c86613defbbaae8d0e24"
}

function Assert-FileHash([string]$Path, [string]$ExpectedHash) {
  $actualHash = (Get-FileHash -Path $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne $ExpectedHash) {
    throw "SHA256 mismatch for $(Split-Path -Leaf $Path): expected $ExpectedHash, got $actualHash"
  }
}

if (-not (Test-Path $installRoot -PathType Container)) {
  throw "Windows device controller is not installed at $installRoot"
}

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
if ($task.State -eq "Running") {
  throw "$taskName is running. Cancel the current device run before updating the controller."
}
if ($task.State -eq "Disabled") {
  throw "$taskName is disabled. Re-enable it from an elevated PowerShell before updating."
}
[xml]$taskXml = Export-ScheduledTask -TaskName $taskName
$triggerNodes = @($taskXml.Task.Triggers.ChildNodes | Where-Object { $_.NodeType -eq "Element" })
if ($triggerNodes.Count -ne 0) {
  throw "$taskName has automatic triggers; refusing an in-place controller update."
}

$workRoot = Join-Path $env:TEMP "foliole-controller-bootstrap-$([guid]::NewGuid().ToString('N'))"
$downloadRoot = Join-Path $workRoot "download"
$backupRoot = Join-Path $workRoot "backup"
$originalFiles = @{}
New-Item -ItemType Directory -Path $downloadRoot, $backupRoot | Out-Null

try {
  [Net.ServicePointManager]::SecurityProtocol =
    [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  foreach ($entry in $files.GetEnumerator()) {
    $sourceUrl = "https://raw.githubusercontent.com/campfirium/foliole/$revision/scripts/windows/$($entry.Key)"
    $downloadPath = Join-Path $downloadRoot $entry.Key
    Invoke-WebRequest -UseBasicParsing -Uri $sourceUrl -OutFile $downloadPath -TimeoutSec 60
    Assert-FileHash -Path $downloadPath -ExpectedHash $entry.Value
  }

  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
  if ($task.State -eq "Running") { throw "$taskName started during controller download" }
  foreach ($entry in $files.GetEnumerator()) {
    $targetPath = Join-Path $installRoot $entry.Key
    $originalFiles[$entry.Key] = Test-Path $targetPath -PathType Leaf
    if ($originalFiles[$entry.Key]) {
      Copy-Item -Path $targetPath -Destination (Join-Path $backupRoot $entry.Key)
    }
    Copy-Item -Path (Join-Path $downloadRoot $entry.Key) -Destination $targetPath -Force
    Assert-FileHash -Path $targetPath -ExpectedHash $entry.Value
  }
} catch {
  foreach ($entry in $files.GetEnumerator()) {
    $targetPath = Join-Path $installRoot $entry.Key
    $backupPath = Join-Path $backupRoot $entry.Key
    if (Test-Path $backupPath -PathType Leaf) {
      Copy-Item -Path $backupPath -Destination $targetPath -Force
    } elseif ($originalFiles.ContainsKey($entry.Key) -and -not $originalFiles[$entry.Key]) {
      Remove-Item -Path $targetPath -Force -ErrorAction SilentlyContinue
    }
  }
  throw
} finally {
  Remove-Item -Path $workRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Foliole Windows device controller updated to $revision"
Write-Host "Token, SSH configuration, and scheduled task were preserved."
