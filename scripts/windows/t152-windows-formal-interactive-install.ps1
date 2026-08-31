param(
  [Parameter(Mandatory = $true)][string]$NodePath,
  [Parameter(Mandatory = $true)][string]$WorkDir,
  [Parameter(Mandatory = $true)][string]$BootstrapScript,
  [Parameter(Mandatory = $true)][string]$StateRoot
)

$ErrorActionPreference = "Stop"
$taskName = "FolioleNativeClient"
$resolvedNode = (Resolve-Path -LiteralPath $NodePath).Path
$resolvedWorkDir = (Resolve-Path -LiteralPath $WorkDir).Path
$resolvedBootstrap = (Resolve-Path -LiteralPath $BootstrapScript).Path
$resolvedState = (Resolve-Path -LiteralPath $StateRoot).Path
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$arguments = '"' + $resolvedBootstrap + '" "' + $resolvedState + '"'
$action = New-ScheduledTaskAction -Execute $resolvedNode -Argument $arguments `
  -WorkingDirectory $resolvedWorkDir
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 3)
Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal `
  -Settings $settings -Force | Out-Null
Write-Output "[t152-interactive-task] status=READY task=$taskName"
