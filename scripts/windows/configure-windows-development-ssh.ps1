param(
  [string]$GitPath = "",
  [Parameter(Mandatory = $true)][string]$MacGitPublicKey,
  [Parameter(Mandatory = $true)][string]$MacPublicKey,
  [string]$NodePath = "",
  [string]$ReceiverPath = ""
)

$ErrorActionPreference = "Stop"

function Get-Ed25519KeyBody([string]$PublicKey, [string]$Label) {
  if ($PublicKey -match '[\r\n]') { throw "$Label must be one public key line" }
  $parts = @($PublicKey.Trim() -split '\s+', 3)
  if ($parts.Count -lt 2 -or $parts[0] -ne "ssh-ed25519" -or $parts[1] -notmatch '^[A-Za-z0-9+/]+={0,3}$') {
    throw "$Label must be an ssh-ed25519 public key"
  }
  try { $decoded = [Convert]::FromBase64String($parts[1]) } catch { throw "$Label has invalid base64 key material" }
  if ($decoded.Length -ne 51) { throw "$Label has an invalid Ed25519 key length" }
  return $parts[1]
}

$installRoot = Join-Path $env:LOCALAPPDATA "Foliole\windows-android-lab"
$configPath = Join-Path $installRoot "config.json"
if ([string]::IsNullOrWhiteSpace($GitPath) -and (Test-Path -LiteralPath $configPath -PathType Leaf)) {
  $GitPath = [string]((Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json).gitPath)
}
if ([string]::IsNullOrWhiteSpace($NodePath)) { $NodePath = Join-Path $installRoot "runtime\node.exe" }
if ([string]::IsNullOrWhiteSpace($ReceiverPath)) { $ReceiverPath = Join-Path $installRoot "windows-android-lab-receive.mjs" }
foreach ($runtimeFile in @($NodePath, $ReceiverPath)) {
  if (!(Test-Path -LiteralPath $runtimeFile -PathType Leaf)) { throw "Required SSH runtime file is missing: $runtimeFile" }
  if ($runtimeFile -match '[\s"\r\n]') { throw "SSH runtime paths must not contain whitespace or quotes" }
}
if ([string]::IsNullOrWhiteSpace($GitPath) -or !(Test-Path -LiteralPath $GitPath -PathType Leaf)) {
  throw "Required Git executable is missing: $GitPath"
}

$shellKeyBody = Get-Ed25519KeyBody $MacPublicKey "MacPublicKey"
$gitKeyBody = Get-Ed25519KeyBody $MacGitPublicKey "MacGitPublicKey"
if ($shellKeyBody -eq $gitKeyBody) { throw "Shell and Git receive keys must be different" }

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$administratorsSid = [Security.Principal.SecurityIdentifier]::new("S-1-5-32-544")
$isAdministratorAccount = @($identity.Groups | ForEach-Object { $_.Value }) -contains $administratorsSid.Value
$isElevated = ([Security.Principal.WindowsPrincipal]$identity).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isElevated) { throw "Windows development SSH must be configured from an elevated PowerShell" }
$commonApplicationData = [Environment]::GetFolderPath("CommonApplicationData")
$sshDirectory = if ($isAdministratorAccount) { Join-Path $commonApplicationData "ssh" } else { Join-Path $env:USERPROFILE ".ssh" }
$authorizedKeys = Join-Path $sshDirectory $(if ($isAdministratorAccount) { "administrators_authorized_keys" } else { "authorized_keys" })
New-Item -ItemType Directory -Force -Path $sshDirectory | Out-Null

$shellKey = "no-agent-forwarding,no-port-forwarding,no-X11-forwarding,no-user-rc $($MacPublicKey.Trim())"
$gitKey = "command=`"$NodePath $ReceiverPath`",no-agent-forwarding,no-port-forwarding,no-pty,no-user-rc $($MacGitPublicKey.Trim())"
$existing = if (Test-Path -LiteralPath $authorizedKeys) { Get-Content -LiteralPath $authorizedKeys } else { @() }
$retained = @($existing | Where-Object {
  $_ -notmatch [regex]::Escape($shellKeyBody) -and $_ -notmatch [regex]::Escape($gitKeyBody)
})
[System.IO.File]::WriteAllLines(
  $authorizedKeys, [string[]]@($retained + $shellKey + $gitKey), [System.Text.UTF8Encoding]::new($false)
)

if ($isAdministratorAccount) {
  icacls.exe $authorizedKeys /inheritance:r /grant "*S-1-5-32-544:F" /grant "SYSTEM:F" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to secure administrators_authorized_keys" }
}

$developmentPathEntries = @(
  (Split-Path -Parent (Resolve-Path -LiteralPath $NodePath).Path),
  (Split-Path -Parent (Resolve-Path -LiteralPath $GitPath).Path)
)
$existingUserPath = @([Environment]::GetEnvironmentVariable("Path", "User") -split ';' | Where-Object { $_ })
$retainedUserPath = @($existingUserPath | Where-Object { $_ -notin $developmentPathEntries })
[Environment]::SetEnvironmentVariable("Path", (@($developmentPathEntries + $retainedUserPath) -join ';'), "User")

$powerShellPath = (Get-Command powershell.exe -ErrorAction Stop).Source
$openSshRegistry = "HKLM:\SOFTWARE\OpenSSH"
New-Item -Path $openSshRegistry -Force | Out-Null
New-ItemProperty -Path $openSshRegistry -Name "DefaultShell" -PropertyType String -Value $powerShellPath -Force | Out-Null
Restart-Service -Name sshd -ErrorAction Stop

Write-Host "Windows development SSH shell key and dedicated Git receive key are configured."
