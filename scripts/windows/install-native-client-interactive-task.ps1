param(
  [Parameter(Mandatory = $true)]
  [string]$NodePath,

  [Parameter(Mandatory = $true)]
  [string]$WorkDir,

  [Parameter(Mandatory = $true)]
  [string]$WorkerScript,

  [ValidateRange(1, 30)]
  [int]$ExecutionTimeLimitMinutes = 3
)

$ErrorActionPreference = "Stop"
$taskName = "FolioleNativeClient"
$resolvedNode = (Resolve-Path -LiteralPath $NodePath).Path
$resolvedWorkDir = (Resolve-Path -LiteralPath $WorkDir).Path
$resolvedWorker = (Resolve-Path -LiteralPath $WorkerScript).Path
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$arguments = '"' + $resolvedWorker + '"'
$action = New-ScheduledTaskAction `
  -Execute $resolvedNode `
  -Argument $arguments `
  -WorkingDirectory $resolvedWorkDir
$principal = New-ScheduledTaskPrincipal `
  -UserId $userId `
  -LogonType Interactive `
  -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes $ExecutionTimeLimitMinutes)

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Principal $principal `
  -Settings $settings `
  -Force | Out-Null

Write-Output "[windows-native-task] status=READY task=$taskName logon=Interactive"
