param(
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
if ([string]::IsNullOrWhiteSpace($NodePath)) { $NodePath = Join-Path $installRoot "runtime\node.exe" }
if ([string]::IsNullOrWhiteSpace($ReceiverPath)) { $ReceiverPath = Join-Path $installRoot "windows-android-lab-receive.mjs" }
foreach ($runtimeFile in @($NodePath, $ReceiverPath)) {
  if (!(Test-Path -LiteralPath $runtimeFile -PathType Leaf)) { throw "Required SSH runtime file is missing: $runtimeFile" }
  if ($runtimeFile -match '[\s"\r\n]') { throw "SSH runtime paths must not contain whitespace or quotes" }
}

$shellKeyBody = Get-Ed25519KeyBody $MacPublicKey "MacPublicKey"
$gitKeyBody = Get-Ed25519KeyBody $MacGitPublicKey "MacGitPublicKey"
if ($shellKeyBody -eq $gitKeyBody) { throw "Shell and Git receive keys must be different" }

$isAdministrator = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator
)
$sshDirectory = if ($isAdministrator) { Join-Path $env:ProgramData "ssh" } else { Join-Path $env:USERPROFILE ".ssh" }
$authorizedKeys = Join-Path $sshDirectory $(if ($isAdministrator) { "administrators_authorized_keys" } else { "authorized_keys" })
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

if ($isAdministrator) {
  icacls.exe $authorizedKeys /inheritance:r /grant "*S-1-5-32-544:F" /grant "SYSTEM:F" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to secure administrators_authorized_keys" }
}

Write-Host "Windows development SSH shell key and dedicated Git receive key are configured."
