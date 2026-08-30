param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("host-facts", "binding-preflight", "prepare-materialize", "prepare-dependencies",
    "prepare-electron-runtime", "prepare-build", "prepare-electron-compile", "prepare-native",
    "prepare-package", "prepare-finalize", "g2-path", "g3-anchor", "formal")]
  [string]$Action,
  [string]$CapsuleRoot = "", [string]$ConfigPath = "", [string]$ControllerRoot = "",
  [string]$EvidenceRoot = "", [string]$NodePath = "", [string]$RequestBase64 = "",
  [string]$SourceRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$productCommit = "86f6580e240c9c4ccd2eb4e146dc8d5be4b1859a"
$productTree = "ec8af4a625d98fb35e86134d8770c50a5e669ccb"
$t7Run = "33270551363"

function Assert-Absolute([string]$Value, [string]$Label) {
  if (!$Value -or ![IO.Path]::IsPathFullyQualified($Value)) { throw "$Label must be explicit" }
}

function Get-Sha256([byte[]]$Bytes) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { $hash = $sha.ComputeHash($Bytes) } finally { $sha.Dispose() }
  return ([BitConverter]::ToString($hash)).Replace('-', '').ToLowerInvariant()
}

function Read-PrepareRequest([string]$Token) {
  if (!$Token -or $Token -notmatch '^[A-Za-z0-9_-]+$') { throw "prepare token is invalid" }
  $base64 = $Token.Replace('-', '+').Replace('_', '/')
  while (($base64.Length % 4) -ne 0) { $base64 += '=' }
  $envelope = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($base64)) |
    ConvertFrom-Json
  if (!$envelope.requestJson -or $envelope.requestSha256 -notmatch '^[0-9a-f]{64}$') {
    throw "prepare envelope is invalid"
  }
  if ((Get-Sha256 ([Text.Encoding]::UTF8.GetBytes([string]$envelope.requestJson))) -ne
      $envelope.requestSha256) { throw "prepare request hash mismatch" }
  $request = $envelope.requestJson | ConvertFrom-Json
  $paths = @('capsuleRoot', 'controllerArchivePath', 'controllerRoot', 'evidenceRoot',
    'manifestPath', 'nodePath', 'npmPath', 'prepareHelperPath', 'productArchivePath',
    'sourceRoot', 'tarPath')
  foreach ($name in @('capsuleId', 'hostFactsSha256', 'identity', 'rootId') + $paths) {
    if ($null -eq $request.PSObject.Properties[$name]) { throw "prepare field missing: $name" }
  }
  foreach ($name in $paths) { Assert-Absolute ([string]$request.$name) $name }
  if ($request.schemaVersion -ne 1 -or $request.capsuleId -notmatch '^[0-9a-f-]{36}$' -or
      $request.rootId -notmatch '^[0-9a-f-]{36}$' -or
      $request.hostFactsSha256 -notmatch '^[0-9a-f]{64}$' -or
      $request.identity.productCommit -ne $productCommit -or
      $request.identity.productTree -ne $productTree -or $request.identity.t7Run -ne $t7Run -or
      $request.identity.controllerCommit -notmatch '^[0-9a-f]{40}$' -or
      $request.identity.controllerTree -notmatch '^[0-9a-f]{40}$') { throw "prepare identity is invalid" }
  $runtime = [ordered]@{ node = (Get-Command node.exe -CommandType Application -ErrorAction Stop).Source
    npm = (Get-Command npm.cmd -CommandType Application -ErrorAction Stop).Source
    tar = (Get-Command tar.exe -CommandType Application -ErrorAction Stop).Source }
  $runtimeExact = $runtime.node -eq $request.nodePath -and $runtime.npm -eq $request.npmPath -and
    $runtime.tar -eq $request.tarPath
  if (!$runtimeExact) { throw "prepare runtime differs from host facts" }
  return [ordered]@{ fieldCount = $request.PSObject.Properties.Count; request = $request
    requestSha256 = [string]$envelope.requestSha256; runtime = $runtime
    runtimeExact = $runtimeExact
    tokenSha256 = (Get-Sha256 ([Text.Encoding]::UTF8.GetBytes($Token))) }
}

function Get-HostFacts {
  $parts = @($env:SSH_CONNECTION -split '\s+' | Where-Object { $_ })
  if ($parts.Count -ne 4) { throw "SSH_CONNECTION is required" }
  $roots = [ordered]@{ localAppData = [IO.Path]::GetFullPath($env:LOCALAPPDATA)
    programFiles = [IO.Path]::GetFullPath($env:ProgramFiles)
    systemRoot = [IO.Path]::GetFullPath($env:SystemRoot)
    temp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    userProfile = [IO.Path]::GetFullPath($env:USERPROFILE) }
  $adapters = @(Get-NetAdapter -Physical | Where-Object { $_.Status -eq "Up" } | ForEach-Object {
    $config = Get-NetIPConfiguration -InterfaceIndex $_.ifIndex
    [ordered]@{ interfaceAlias = [string]$_.Name; interfaceIndex = [int]$_.ifIndex
      ipv4 = @($config.IPv4Address | ForEach-Object {
        [ordered]@{ address = [string]$_.IPAddress; prefixLength = [int]$_.PrefixLength } })
      mediaType = [string]$_.MediaType } })
  $profiles = @(Get-NetConnectionProfile | ForEach-Object { [ordered]@{
    interfaceAlias = [string]$_.InterfaceAlias; interfaceIndex = [int]$_.InterfaceIndex
    ipv4Connectivity = [string]$_.IPv4Connectivity; networkCategory = [string]$_.NetworkCategory } })
  $vpn = @(Get-VpnConnection -AllUserConnection:$false -ErrorAction SilentlyContinue |
    Where-Object { $_.ConnectionStatus -eq "Connected" } | ForEach-Object {
      [ordered]@{ name = [string]$_.Name; status = [string]$_.ConnectionStatus } })
  $service = Get-Service -Name Dnscache
  $firewall = @(Get-NetFirewallProfile | ForEach-Object { [ordered]@{
    defaultInboundAction = [string]$_.DefaultInboundAction
    defaultOutboundAction = [string]$_.DefaultOutboundAction; enabled = [bool]$_.Enabled
    name = [string]$_.Name } })
  return [ordered]@{ activePhysicalAdapters = $adapters
    capturedAt = [DateTime]::UtcNow.ToString("o"); connectedVpn = $vpn
    dnsSdService = [ordered]@{ name = $service.Name; status = [string]$service.Status }
    firewallProfiles = $firewall; networkProfiles = $profiles
    runtime = [ordered]@{ node = (Get-Command node.exe -CommandType Application -ErrorAction Stop).Source
      npm = (Get-Command npm.cmd -CommandType Application -ErrorAction Stop).Source
      tar = (Get-Command tar.exe -CommandType Application -ErrorAction Stop).Source }; roots = $roots
    schemaVersion = 2; sshSession = [ordered]@{ clientAddress = $parts[0]
      serverAddress = $parts[2]; serverPort = [int]$parts[3]; sessionProcessId = $PID } }
}

try {
  if ($Action -eq "host-facts") {
    Write-Output "T152_HOST_FACTS=$(Get-HostFacts | ConvertTo-Json -Compress -Depth 10)"
    exit 0
  }
  if ($Action -eq "binding-preflight" -or $Action.StartsWith("prepare-")) {
    $binding = Read-PrepareRequest $RequestBase64
    if ($Action -eq "binding-preflight") {
      $receipt = [ordered]@{ fieldCount = $binding.fieldCount
        requestSha256 = $binding.requestSha256; runtimeExact = $binding.runtimeExact
        runtimeExists = [ordered]@{ node = (Test-Path -LiteralPath $binding.runtime.node -PathType Leaf)
          npm = (Test-Path -LiteralPath $binding.runtime.npm -PathType Leaf)
          tar = (Test-Path -LiteralPath $binding.runtime.tar -PathType Leaf) } }
      Write-Output "T152_BINDING_PREFLIGHT=$($receipt | ConvertTo-Json -Compress -Depth 4)"
      exit 0
    }
    if (!(Test-Path -LiteralPath $binding.request.prepareHelperPath -PathType Leaf)) {
      throw "prepare stage helper is missing"
    }
    . $binding.request.prepareHelperPath
    Invoke-T152PrepareStage -Action $Action -Binding $binding
    exit 0
  }
  foreach ($item in @(@($CapsuleRoot, "capsule root"), @($ControllerRoot, "controller root"),
      @($EvidenceRoot, "evidence root"), @($NodePath, "node path"),
      @($SourceRoot, "source root"))) { Assert-Absolute $item[0] $item[1] }
  Assert-Absolute $ConfigPath "interactive config"
  $runner = Join-Path $ControllerRoot "scripts\windows\t152-windows-capsule-formal-runner.mjs"
  & $NodePath $runner $ConfigPath
  if ($LASTEXITCODE -ne 0) { throw "interactive runner failed with exit $LASTEXITCODE" }
} catch { Write-Error $_; exit 74 }
