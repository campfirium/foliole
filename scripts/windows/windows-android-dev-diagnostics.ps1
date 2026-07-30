param(
  [Parameter(Mandatory = $true)][string]$RepoRoot,
  [Parameter(Mandatory = $true)][int]$SessionProcessId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-CanonicalFile([string]$FilePath) {
  $resolved = (Resolve-Path -LiteralPath $FilePath -ErrorAction Stop).Path
  if (!(Test-Path -LiteralPath $resolved -PathType Leaf)) { throw "Expected file is missing: $resolved" }
  return $resolved
}

function Get-Sha256([string]$FilePath) {
  return (Get-FileHash -LiteralPath $FilePath -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
}

function Get-Owner($Process) {
  $owner = Invoke-CimMethod -InputObject $Process -MethodName GetOwner -ErrorAction Stop
  if ([int]$owner.ReturnValue -ne 0 -or [string]::IsNullOrWhiteSpace([string]$owner.User)) {
    throw "Process owner could not be resolved for PID $($Process.ProcessId)"
  }
  return "$($owner.Domain)\$($owner.User)"
}

function Get-ProcessRecord([int]$ProcessId, [bool]$RequireImage) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop
  if ($null -eq $process) { throw "Process disappeared before inspection: PID $ProcessId" }
  $imagePath = [string]$process.ExecutablePath
  if ($RequireImage -and [string]::IsNullOrWhiteSpace($imagePath)) {
    throw "Process image could not be resolved for PID $ProcessId"
  }
  $canonical = if ([string]::IsNullOrWhiteSpace($imagePath)) { $null } else { Get-CanonicalFile $imagePath }
  return [ordered]@{
    imagePath = $canonical
    imageSha256 = if ($null -eq $canonical) { $null } else { Get-Sha256 $canonical }
    name = [string]$process.Name
    owner = Get-Owner $process
    parentProcessId = [int]$process.ParentProcessId
    processId = [int]$process.ProcessId
    sessionId = [int]$process.SessionId
  }
}

function Get-AdbClientRecord {
  $configPath = Join-Path $env:LOCALAPPDATA "Foliole\windows-android-lab\config.json"
  if (!(Test-Path -LiteralPath $configPath -PathType Leaf)) { throw "Legacy Android Lab config is required to identify the ADB client" }
  $config = Get-Content -LiteralPath $configPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
  if ([string]::IsNullOrWhiteSpace([string]$config.adbPath)) { throw "Legacy Android Lab config does not identify the ADB client" }
  $imagePath = Get-CanonicalFile ([string]$config.adbPath)
  return [ordered]@{
    imagePath = $imagePath
    imageSha256 = Get-Sha256 $imagePath
    name = "adb.exe"
    owner = $null
    parentProcessId = $null
    processId = $null
    resolutionSource = "legacy-lab-config"
    sessionId = $null
  }
}

function Get-ListeningPorts {
  return @(Get-NetTCPConnection -State Listen -ErrorAction Stop |
    Where-Object { $_.LocalPort -in @(5037, 5601) } |
    ForEach-Object {
      [ordered]@{
        localAddress = [string]$_.LocalAddress
        localPort = [int]$_.LocalPort
        owningProcess = [int]$_.OwningProcess
        state = [string]$_.State
      }
    })
}

function Get-AdbProcesses($Listeners) {
  $ids = @(Get-CimInstance Win32_Process -Filter "Name = 'adb.exe'" -ErrorAction Stop |
    ForEach-Object { [int]$_.ProcessId })
  $listenerIds = @($Listeners | ForEach-Object { [int]$_.owningProcess })
  return @(@($ids + $listenerIds) | Sort-Object -Unique | ForEach-Object {
    $record = Get-ProcessRecord $_ $true
    if ($record.name -ieq "adb.exe") { $record }
  })
}

function Get-StringSha256([string]$Value) {
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
    return [Convert]::ToBase64String($algorithm.ComputeHash($bytes)).TrimEnd('=')
  } finally { $algorithm.Dispose() }
}

function Get-AuthorizedKeyEntry([string]$Line) {
  $pattern = '^(?<options>.*?)(?<type>ssh-(?:ed25519|rsa)|ecdsa-sha2-nistp\d+)\s+(?<body>[A-Za-z0-9+/=]+)(?:\s+.*)?$'
  if ($Line -notmatch $pattern) {
    return [ordered]@{ forcedCommand = $false; keySha256 = Get-StringSha256 $Line; keyType = "unparsed"; restrictions = @() }
  }
  $keyBody = $Matches.body
  $keyOptions = $Matches.options
  $keyType = $Matches.type
  $decoded = [Convert]::FromBase64String($keyBody)
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try { $fingerprint = [Convert]::ToBase64String($algorithm.ComputeHash($decoded)).TrimEnd('=') }
  finally { $algorithm.Dispose() }
  $restrictions = @("no-agent-forwarding", "no-port-forwarding", "no-pty", "no-user-rc", "no-X11-forwarding") |
    Where-Object { $keyOptions -match "(^|,)$_(,|\s|$)" }
  return [ordered]@{
    forcedCommand = $keyOptions -match '(^|,)command='
    keySha256 = $fingerprint
    keyType = $keyType
    restrictions = @($restrictions)
  }
}

function Get-AuthorizedKeysSummary {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $adminSid = [Security.Principal.SecurityIdentifier]::new("S-1-5-32-544")
  $isAdminAccount = @($identity.Groups | ForEach-Object { $_.Value }) -contains $adminSid.Value
  $directory = if ($isAdminAccount) { Join-Path ([Environment]::GetFolderPath("CommonApplicationData")) "ssh" } else {
    Join-Path $env:USERPROFILE ".ssh"
  }
  $file = Join-Path $directory $(if ($isAdminAccount) { "administrators_authorized_keys" } else { "authorized_keys" })
  $lines = if (Test-Path -LiteralPath $file -PathType Leaf) { Get-Content -LiteralPath $file -ErrorAction Stop } else { @() }
  return [ordered]@{
    entries = @($lines | Where-Object { $_ -and -not $_.TrimStart().StartsWith('#') } | ForEach-Object { Get-AuthorizedKeyEntry $_ })
    path = $file
  }
}

function Get-ScheduledTaskSummary {
  $task = @(Get-ScheduledTask -ErrorAction Stop | Where-Object { $_.TaskName -eq "FolioleAndroidLab" }) | Select-Object -First 1
  if ($null -eq $task) { return $null }
  $info = Get-ScheduledTaskInfo -InputObject $task -ErrorAction Stop
  return [ordered]@{
    actions = @($task.Actions | ForEach-Object {
      [ordered]@{ arguments = [string]$_.Arguments; execute = [string]$_.Execute; workingDirectory = [string]$_.WorkingDirectory }
    })
    lastTaskResult = [int]$info.LastTaskResult
    name = [string]$task.TaskName
    principal = [string]$task.Principal.UserId
    state = [string]$task.State
    taskPath = [string]$task.TaskPath
  }
}

function Get-OldRuntimeSummary {
  $root = Join-Path $env:LOCALAPPDATA "Foliole\windows-android-lab"
  $exists = Test-Path -LiteralPath $root -PathType Container
  $entries = if ($exists) { @(Get-ChildItem -LiteralPath $root -Force -ErrorAction Stop | ForEach-Object {
    [ordered]@{
      lastWriteTimeUtc = $_.LastWriteTimeUtc.ToString("o")
      length = if ($_.PSIsContainer) { $null } else { [long]$_.Length }
      name = [string]$_.Name
      type = if ($_.PSIsContainer) { "directory" } else { "file" }
    }
  }) } else { @() }
  return [ordered]@{ entries = @($entries); exists = $exists; root = $root }
}

function Get-SshSessionSummary {
  $parts = @($env:SSH_CONNECTION -split '\s+' | Where-Object { $_ })
  if ($parts.Count -ne 4) { throw "SSH_CONNECTION is required for the read-only diagnostic entry" }
  $process = Get-ProcessRecord $SessionProcessId $false
  return [ordered]@{
    clientAddress = $parts[0]; clientPort = [int]$parts[1]; parentProcessId = $process.parentProcessId
    processId = $process.processId; serverAddress = $parts[2]; serverPort = [int]$parts[3]
    sessionId = $process.sessionId; user = $process.owner
  }
}

if (!(Test-Path -LiteralPath $RepoRoot -PathType Container)) { throw "Repository root is missing" }
$listeners = Get-ListeningPorts
$pnpDevices = @(Get-CimInstance Win32_PnPEntity -ErrorAction Stop |
  Where-Object { $_.PNPClass -in @("AndroidUsbDeviceClass", "USB", "WPD") } |
  ForEach-Object {
    [ordered]@{ class = [string]$_.PNPClass; instanceId = [string]$_.DeviceID; name = [string]$_.Name; status = [string]$_.Status }
  })

[ordered]@{
  adbClient = Get-AdbClientRecord
  adbProcesses = @(Get-AdbProcesses $listeners)
  authorizedKeys = Get-AuthorizedKeysSummary
  capturedAt = [DateTime]::UtcNow.ToString("o")
  listeners = @($listeners)
  oldRuntime = Get-OldRuntimeSummary
  pnpDevices = @($pnpDevices)
  scheduledTask = Get-ScheduledTaskSummary
  schemaVersion = 1
  sshSession = Get-SshSessionSummary
} | ConvertTo-Json -Depth 8 -Compress
