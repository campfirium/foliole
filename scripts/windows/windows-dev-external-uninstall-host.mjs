/* global process */

import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';

const SNAPSHOT_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$oldRoot = $env:FOLIOLE_T7_OLD_ROOT.TrimEnd('\')
$prefix = $oldRoot + '\'
$comparison = [StringComparison]::OrdinalIgnoreCase
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
$task = Get-ScheduledTask -TaskName 'FolioleAndroidLab' -ErrorAction SilentlyContinue
$taskSummary = if ($null -eq $task) { $null } else {
  [ordered]@{
    actions = @($task.Actions | ForEach-Object {
      [ordered]@{ arguments = [string]$_.Arguments; execute = [string]$_.Execute }
    })
    name = [string]$task.TaskName
    taskPath = [string]$task.TaskPath
  }
}
$processes = @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
  $image = [string]$_.ExecutablePath
  $command = [string]$_.CommandLine
  $image.StartsWith($prefix, $comparison) -or $command.IndexOf($prefix, $comparison) -ge 0
} | ForEach-Object {
  [ordered]@{ imagePath = [string]$_.ExecutablePath; name = [string]$_.Name; processId = [int]$_.ProcessId }
})
$roots = @(
  'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
$packages = @(Get-ItemProperty -Path $roots -ErrorAction SilentlyContinue | Where-Object {
  $_.DisplayName -eq 'Node.js' -and $_.DisplayVersion -eq '22.23.2'
} | ForEach-Object {
  [ordered]@{
    displayName = [string]$_.DisplayName
    displayVersion = [string]$_.DisplayVersion
    productCode = [string]$_.PSChildName
    publisher = [string]$_.Publisher
    windowsInstaller = [int]$_.WindowsInstaller
  }
})
$signature = Get-AuthenticodeSignature -LiteralPath 'C:\Program Files\nodejs\node.exe'
[ordered]@{
  isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  nodePackages = @($packages)
  nodeSignature = [ordered]@{
    signerSubject = [string]$signature.SignerCertificate.Subject
    status = [string]$signature.Status
    thumbprint = [string]$signature.SignerCertificate.Thumbprint
  }
  oldProcesses = @($processes)
  scheduledTask = $taskSummary
} | ConvertTo-Json -Depth 6 -Compress
`;

function failure(message) {
  return Object.assign(new Error(message), { exitCode: 74, failureStage: 'host-snapshot' });
}

export function inspectExternalUninstallHost(oldRoot, execute = spawnSync) {
  const encoded = Buffer.from(SNAPSHOT_SCRIPT, 'utf16le').toString('base64');
  const result = execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
    encoding: 'utf8', env: { ...process.env, FOLIOLE_T7_OLD_ROOT: oldRoot },
    maxBuffer: 5 * 1024 * 1024, shell: false, timeout: 30_000, windowsHide: true
  });
  if (result.error || result.status !== 0) {
    throw failure(String(result.error?.message || result.stderr || result.stdout || 'host snapshot failed').trim());
  }
  try {
    return JSON.parse(result.stdout.trim());
  } catch (error) {
    throw failure(`host snapshot JSON is invalid: ${error.message}`);
  }
}
