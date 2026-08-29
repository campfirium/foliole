param(
  [Parameter(Mandatory = $true)][ValidateSet("host-facts", "prepare")][string]$Action,
  [Parameter(Mandatory = $true)][ValidatePattern("^[0-9a-f-]{36}$")][string]$AttemptId,
  [ValidatePattern("^t152-product-[0-9a-f-]{36}\.tar$")][string]$ArchiveName = "",
  [ValidatePattern("^t152-manifest-[0-9a-f-]{36}\.json$")][string]$ManifestName = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$productCommit = "86f6580e240c9c4ccd2eb4e146dc8d5be4b1859a"
$productTree = "ec8af4a625d98fb35e86134d8770c50a5e669ccb"
$t7Run = "33270551363"
$capsules = Join-Path $env:LOCALAPPDATA "Foliole\windows-dev-control\capsules"
$taskRoot = Join-Path $capsules $AttemptId
$evidenceRoot = Join-Path $taskRoot "evidence"
$sourceRoot = Join-Path $taskRoot "source"
$receiptPath = Join-Path $evidenceRoot "$Action-receipt.json"

function Write-Receipt([hashtable]$Receipt) {
  New-Item -ItemType Directory -Force -Path $evidenceRoot | Out-Null
  $Receipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $receiptPath -Encoding utf8
  Write-Output "[t152-windows-capsule] action=$Action attempt=$AttemptId receipt=$receiptPath"
}

function Get-HostFacts {
  $parts = @($env:SSH_CONNECTION -split '\s+' | Where-Object { $_ })
  if ($parts.Count -ne 4) { throw "SSH_CONNECTION is required" }
  $adapters = @(Get-NetAdapter -Physical | Where-Object { $_.Status -eq "Up" } | ForEach-Object {
    $config = Get-NetIPConfiguration -InterfaceIndex $_.ifIndex
    [ordered]@{ interfaceAlias = [string]$_.Name; interfaceIndex = [int]$_.ifIndex
      ipv4 = @($config.IPv4Address | ForEach-Object {
        [ordered]@{ address = [string]$_.IPAddress; prefixLength = [int]$_.PrefixLength } })
      mediaType = [string]$_.MediaType }
  })
  $profiles = @(Get-NetConnectionProfile | ForEach-Object { [ordered]@{
    interfaceAlias = [string]$_.InterfaceAlias; interfaceIndex = [int]$_.InterfaceIndex
    ipv4Connectivity = [string]$_.IPv4Connectivity; ipv6Connectivity = [string]$_.IPv6Connectivity
    networkCategory = [string]$_.NetworkCategory } })
  $vpn = @(Get-VpnConnection -AllUserConnection:$false -ErrorAction SilentlyContinue |
    Where-Object { $_.ConnectionStatus -eq "Connected" } | ForEach-Object {
      [ordered]@{ name = [string]$_.Name; status = [string]$_.ConnectionStatus } })
  $service = Get-Service -Name Dnscache
  $firewall = @(Get-NetFirewallProfile | ForEach-Object { [ordered]@{
    defaultInboundAction = [string]$_.DefaultInboundAction
    defaultOutboundAction = [string]$_.DefaultOutboundAction; enabled = [bool]$_.Enabled
    name = [string]$_.Name } })
  return [ordered]@{ activePhysicalAdapters = $adapters; capturedAt = [DateTime]::UtcNow.ToString("o")
    connectedVpn = $vpn; dnsSdService = [ordered]@{ name = $service.Name; status = [string]$service.Status }
    firewallProfiles = $firewall; networkProfiles = $profiles; schemaVersion = 1
    sshSession = [ordered]@{ clientAddress = $parts[0]; serverAddress = $parts[2]
      serverPort = [int]$parts[3]; sessionProcessId = $PID } }
}

function Invoke-Checked([string]$Stage, [string]$File, [string[]]$Arguments) {
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $output = @(& $File @Arguments 2>&1)
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousPreference
  }
  @($output | ForEach-Object { [string]$_ }) |
    Set-Content -LiteralPath (Join-Path $evidenceRoot "$Stage.log") -Encoding utf8
  if ($exitCode -ne 0) { throw "$Stage failed with exit $exitCode" }
}

try {
  if (Test-Path -LiteralPath $taskRoot) { throw "attempt capsule already exists" }
  New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null
  if ($Action -eq "host-facts") {
    $facts = Get-HostFacts
    Write-Receipt @{ action = $Action; attemptId = $AttemptId; facts = $facts
      resultStatus = "success"; schemaVersion = 1 }
    exit 0
  }
  if (!$ArchiveName -or !$ManifestName) { throw "prepare requires archive and manifest" }
  $homeRoot = [Environment]::GetFolderPath("UserProfile")
  $archive = Join-Path $homeRoot $ArchiveName
  $manifestFile = Join-Path $homeRoot $ManifestName
  $manifest = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
  if ($manifest.identity.productCommit -ne $productCommit -or
      $manifest.identity.productTree -ne $productTree -or $manifest.identity.t7Run -ne $t7Run) {
    throw "product identity mismatch"
  }
  if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne
      $manifest.archiveSha256) { throw "archive digest mismatch" }
  New-Item -ItemType Directory -Path $sourceRoot | Out-Null
  Invoke-Checked "extract" "C:\Windows\System32\tar.exe" @("-xf", $archive, "-C", $sourceRoot)
  if ((Get-FileHash -LiteralPath (Join-Path $sourceRoot "package-lock.json") -Algorithm SHA256).Hash.ToLowerInvariant() -ne
      $manifest.lockfileSha256) { throw "lockfile digest mismatch" }
  [string[]]$files = @(Get-ChildItem -LiteralPath $sourceRoot -File -Recurse | ForEach-Object {
    $_.FullName.Substring($sourceRoot.Length + 1).Replace("\", "/") })
  [Array]::Sort($files, [StringComparer]::Ordinal)
  $list = [string]::Join("`n", $files) + "`n"
  $listPath = Join-Path $evidenceRoot "archive-files.txt"
  [IO.File]::WriteAllText($listPath, $list, [Text.UTF8Encoding]::new($false))
  $listHash = (Get-FileHash -LiteralPath $listPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($files.Count -ne $manifest.fileCount -or $listHash -ne $manifest.fileListSha256) {
    throw "archive file list mismatch"
  }
  $node = "C:\Program Files\nodejs\node.exe"
  $npm = "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js"
  Invoke-Checked "dependencies" $node @($npm, "ci", "--prefix", $sourceRoot)
  Invoke-Checked "electron-runtime" $node @((Join-Path $sourceRoot "node_modules\electron\install.js"))
  Push-Location $sourceRoot
  try {
    Invoke-Checked "build" $node @($npm, "run", "build")
    Invoke-Checked "electron-compile" $node @($npm, "run", "electron:compile")
    Invoke-Checked "native-rebuild" $node @($npm, "run", "electron:rebuild:native")
    Invoke-Checked "native-probe" (Join-Path $sourceRoot "node_modules\electron\dist\electron.exe") @(
      (Join-Path $sourceRoot "scripts\desktop\desktop-dnssd-native-probe.cjs"))
    Invoke-Checked "package-smoke" $node @($npm, "run", "windows:package")
  } finally { Pop-Location }
  Write-Receipt @{ action = $Action; attemptId = $AttemptId; archiveSha256 = $manifest.archiveSha256
    completedAt = [DateTime]::UtcNow.ToString("o"); fileCount = $files.Count
    identity = $manifest.identity; lockfileSha256 = $manifest.lockfileSha256
    resultStatus = "success"; schemaVersion = 1; sourceRoot = $sourceRoot }
} catch {
  Write-Receipt @{ action = $Action; attemptId = $AttemptId; failure = $_.Exception.Message
    resultStatus = "failed"; schemaVersion = 1 }
  exit 74
}
