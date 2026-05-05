param(
  [Parameter(Mandatory = $true)]
  [string]$LogDir
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Set-Location -Path $env:SystemRoot

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$logPath = Join-Path $LogDir "windows-env-check-$timestamp.log"

function Write-Log {
  param([string]$Message)
  $Message | Tee-Object -FilePath $logPath -Append
}

function Check-Command {
  param(
    [string]$Name,
    [string]$VersionCommand
  )

  try {
    $command = Get-Command $Name -ErrorAction Stop
    $versionTarget = $Name
    if ($command.Source) {
      $versionTarget = $command.Source
    }

    $version = (Invoke-Expression $VersionCommand | Select-Object -First 1)
    if ([string]::IsNullOrWhiteSpace([string]$version) -and $Name -eq "npm") {
      $version = (& $versionTarget "--version" | Select-Object -First 1)
    }
    if ([string]::IsNullOrWhiteSpace([string]$version)) {
      return @{ Installed = $true; Version = "Detected (version unavailable)" }
    }

    return @{ Installed = $true; Version = [string]$version }
  } catch {
    return @{ Installed = $false; Version = "" }
  }
}

function Check-VcBuildTools {
  $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
  if (-not (Test-Path $vswhere)) {
    return @{ Installed = $false; Version = "" }
  }

  $installPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
  if ([string]::IsNullOrWhiteSpace([string]$installPath)) {
    return @{ Installed = $false; Version = "" }
  }

  return @{ Installed = $true; Version = [string]$installPath }
}

function Check-WebView2 {
  $clientKey = "SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
  $hives = @(
    "HKLM:\$clientKey",
    "HKCU:\$clientKey",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
  )
  foreach ($key in $hives) {
    try {
      $version = (Get-ItemProperty -Path $key -Name "pv" -ErrorAction Stop).pv
      if (-not [string]::IsNullOrWhiteSpace([string]$version)) {
        return @{ Installed = $true; Version = [string]$version }
      }
    } catch {
    }
  }

  $webViewExe = Join-Path ${env:ProgramFiles(x86)} "Microsoft\EdgeWebView\Application\msedgewebview2.exe"
  if (Test-Path $webViewExe) {
    $fileVersion = (Get-Item $webViewExe).VersionInfo.ProductVersion
    if (-not [string]::IsNullOrWhiteSpace([string]$fileVersion)) {
      return @{ Installed = $true; Version = [string]$fileVersion }
    }
    return @{ Installed = $true; Version = "Detected (file found)" }
  }

  return @{ Installed = $false; Version = "" }
}

$script:results = @()

function Add-Result {
  param(
    [string]$Name,
    [bool]$Required,
    [bool]$Installed,
    [string]$Version,
    [string]$Hint
  )

  $script:results += [PSCustomObject]@{
    Name      = $Name
    Required  = if ($Required) { "Yes" } else { "No" }
    Installed = if ($Installed) { "Yes" } else { "No" }
    Version   = if ($Installed) { $Version } else { "-" }
    Hint      = if ($Installed) { "-" } else { $Hint }
  }
}

Write-Log "[windows-env-check] started at $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")"
Write-Log "[windows-env-check] PowerShell: $($PSVersionTable.PSVersion)"

$node = Check-Command -Name "node" -VersionCommand "node --version"
Add-Result -Name "Node.js" -Required $true -Installed $node.Installed -Version $node.Version -Hint "Install Node.js LTS on Windows."

$npm = Check-Command -Name "npm.cmd" -VersionCommand "npm.cmd --version"
if (-not $npm.Installed) {
  $npm = Check-Command -Name "npm" -VersionCommand "npm --version"
}
Add-Result -Name "npm" -Required $true -Installed $npm.Installed -Version $npm.Version -Hint "Install npm with Node.js."

$rustc = Check-Command -Name "rustc" -VersionCommand "rustc --version"
Add-Result -Name "rustc" -Required $true -Installed $rustc.Installed -Version $rustc.Version -Hint "Install Rust toolchain via rustup on Windows."

$cargo = Check-Command -Name "cargo" -VersionCommand "cargo --version"
Add-Result -Name "cargo" -Required $true -Installed $cargo.Installed -Version $cargo.Version -Hint "Install Rust toolchain via rustup on Windows."

$vcTools = Check-VcBuildTools
Add-Result -Name "VS C++ Build Tools" -Required $true -Installed $vcTools.Installed -Version $vcTools.Version -Hint "Install Visual Studio Build Tools with C++ workload."

$webview2 = Check-WebView2
Add-Result -Name "WebView2 Runtime" -Required $true -Installed $webview2.Installed -Version $webview2.Version -Hint "Install Evergreen WebView2 Runtime."

$git = Check-Command -Name "git" -VersionCommand "git --version"
Add-Result -Name "Git" -Required $false -Installed $git.Installed -Version $git.Version -Hint "Install Git for Windows (optional but recommended)."

Write-Log ""
Write-Log "[windows-env-check] prerequisite summary"
$summary = $script:results | Format-Table -AutoSize | Out-String -Width 240
$summary | Tee-Object -FilePath $logPath -Append | Out-Host

$missingRequired = @($script:results | Where-Object { $_.Required -eq "Yes" -and $_.Installed -eq "No" })
if ($missingRequired.Count -gt 0) {
  Write-Log ""
  Write-Log "[windows-env-check] missing required prerequisites:"
  foreach ($item in $missingRequired) {
    Write-Log " - $($item.Name): $($item.Hint)"
  }
  Write-Log "[windows-env-check] status: FAIL"
  Write-Log "[windows-env-check] log file: $logPath"
  exit 1
}

Write-Log ""
Write-Log "[windows-env-check] status: PASS"
Write-Log "[windows-env-check] log file: $logPath"
exit 0
