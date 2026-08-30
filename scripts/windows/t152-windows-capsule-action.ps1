param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("host-facts", "binding-preflight", "prepare", "g2-path", "g3-anchor", "formal")]
  [string]$Action,
  [string]$CapsuleRoot = "",
  [string]$ConfigPath = "",
  [string]$ControllerRoot = "",
  [string]$EvidenceRoot = "",
  [string]$NodePath = "",
  [string]$RequestBase64 = "",
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

function Read-PrepareRequest([string]$Token) {
  if (!$Token -or $Token -notmatch '^[A-Za-z0-9_-]+$') { throw "prepare token is invalid" }
  $base64 = $Token.Replace('-', '+').Replace('_', '/')
  while (($base64.Length % 4) -ne 0) { $base64 += '=' }
  $envelope = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($base64)) |
    ConvertFrom-Json
  if (!$envelope.requestJson -or $envelope.requestSha256 -notmatch '^[0-9a-f]{64}$') {
    throw "prepare envelope is invalid"
  }
  $bytes = [Text.Encoding]::UTF8.GetBytes([string]$envelope.requestJson)
  $sha = [Security.Cryptography.SHA256]::Create()
  try { $hashBytes = $sha.ComputeHash($bytes) } finally { $sha.Dispose() }
  $hash = ([BitConverter]::ToString($hashBytes)).Replace('-', '').ToLowerInvariant()
  if ($hash -ne $envelope.requestSha256) { throw "prepare request hash mismatch" }
  $request = $envelope.requestJson | ConvertFrom-Json
  $required = @('capsuleId', 'capsuleRoot', 'controllerArchivePath', 'controllerRoot',
    'evidenceRoot', 'hostFactsSha256', 'identity', 'manifestPath', 'nodePath', 'npmPath',
    'productArchivePath', 'rootId', 'sourceRoot', 'tarPath')
  foreach ($name in $required) {
    if ($null -eq $request.PSObject.Properties[$name]) { throw "prepare field missing: $name" }
  }
  foreach ($name in @('capsuleRoot', 'controllerArchivePath', 'controllerRoot', 'evidenceRoot',
      'manifestPath', 'nodePath', 'npmPath', 'productArchivePath', 'sourceRoot', 'tarPath')) {
    Assert-Absolute ([string]$request.$name) $name
  }
  if ($request.schemaVersion -ne 1 -or $request.capsuleId -notmatch '^[0-9a-f-]{36}$' -or
      $request.rootId -notmatch '^[0-9a-f-]{36}$' -or
      $request.hostFactsSha256 -notmatch '^[0-9a-f]{64}$' -or
      $request.identity.productCommit -ne $productCommit -or
      $request.identity.productTree -ne $productTree -or $request.identity.t7Run -ne $t7Run -or
      $request.identity.controllerCommit -notmatch '^[0-9a-f]{40}$' -or
      $request.identity.controllerTree -notmatch '^[0-9a-f]{40}$') {
    throw "prepare identity is invalid"
  }
  $runtime = [ordered]@{
    node = (Get-Command node.exe -CommandType Application -ErrorAction Stop).Source
    npm = (Get-Command npm.cmd -CommandType Application -ErrorAction Stop).Source
    tar = (Get-Command tar.exe -CommandType Application -ErrorAction Stop).Source
  }
  $runtimeExact = $runtime.node -eq $request.nodePath -and $runtime.npm -eq $request.npmPath -and
    $runtime.tar -eq $request.tarPath
  if (!$runtimeExact) { throw "prepare runtime differs from host facts" }
  return [ordered]@{ fieldCount = $request.PSObject.Properties.Count; request = $request
    requestSha256 = [string]$envelope.requestSha256; runtime = $runtime; runtimeExact = $runtimeExact }
}

function Invoke-Checked([string]$Stage, [string]$File, [string[]]$Arguments) {
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $output = @(& $File @Arguments 2>&1)
    $exitCode = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previousPreference }
  @($output | ForEach-Object { [string]$_ }) |
    Set-Content -LiteralPath (Join-Path $EvidenceRoot "$Stage.log") -Encoding utf8
  if ($exitCode -ne 0) { throw "$Stage failed with exit $exitCode" }
}

function Get-FileListFacts([string]$Root, [string]$Name) {
  [string[]]$files = @(Get-ChildItem -LiteralPath $Root -File -Recurse | ForEach-Object {
    $_.FullName.Substring($Root.Length + 1).Replace("\", "/") })
  [Array]::Sort($files, [StringComparer]::Ordinal)
  $listPath = Join-Path $EvidenceRoot "$Name-files.txt"
  [IO.File]::WriteAllText($listPath, ([string]::Join("`n", $files) + "`n"),
    [Text.UTF8Encoding]::new($false))
  return [ordered]@{ count = $files.Count
    sha256 = (Get-FileHash $listPath -Algorithm SHA256).Hash.ToLowerInvariant() }
}

function Get-HostFacts {
  $parts = @($env:SSH_CONNECTION -split '\s+' | Where-Object { $_ })
  if ($parts.Count -ne 4) { throw "SSH_CONNECTION is required" }
  $node = (Get-Command node.exe -CommandType Application -ErrorAction Stop).Source
  $npm = (Get-Command npm.cmd -CommandType Application -ErrorAction Stop).Source
  $tar = (Get-Command tar.exe -CommandType Application -ErrorAction Stop).Source
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
      mediaType = [string]$_.MediaType }
  })
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
    runtime = [ordered]@{ node = $node; npm = $npm; tar = $tar }; roots = $roots
    schemaVersion = 2; sshSession = [ordered]@{ clientAddress = $parts[0]
      serverAddress = $parts[2]; serverPort = [int]$parts[3]; sessionProcessId = $PID } }
}

function Write-Receipt([hashtable]$Receipt, [string]$Name) {
  New-Item -ItemType Directory -Force -Path $EvidenceRoot | Out-Null
  $receiptPath = Join-Path $EvidenceRoot $Name
  $Receipt | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $receiptPath -Encoding utf8
  Write-Output "[t152-windows-capsule] action=$Action receipt=$receiptPath"
}

try {
  if ($Action -eq "host-facts") {
    $json = Get-HostFacts | ConvertTo-Json -Compress -Depth 10
    Write-Output "T152_HOST_FACTS=$json"
    exit 0
  }
  if ($Action -eq "binding-preflight" -or $Action -eq "prepare") {
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
    $ArchivePath = [string]$binding.request.productArchivePath
    $CapsuleRoot = [string]$binding.request.capsuleRoot
    $ControllerArchivePath = [string]$binding.request.controllerArchivePath
    $ControllerRoot = [string]$binding.request.controllerRoot
    $EvidenceRoot = [string]$binding.request.evidenceRoot
    $ManifestPath = [string]$binding.request.manifestPath
    $NodePath = [string]$binding.request.nodePath
    $NpmPath = [string]$binding.request.npmPath
    $SourceRoot = [string]$binding.request.sourceRoot
    $TarPath = [string]$binding.request.tarPath
  }
  foreach ($item in @(@($CapsuleRoot, "capsule root"), @($ControllerRoot, "controller root"),
      @($EvidenceRoot, "evidence root"), @($NodePath, "node path"),
      @($SourceRoot, "source root"))) { Assert-Absolute $item[0] $item[1] }
  if ($Action -eq "prepare") {
    foreach ($item in @(@($ArchivePath, "product archive"),
        @($ControllerArchivePath, "controller archive"), @($ManifestPath, "manifest"),
        @($NpmPath, "npm path"), @($TarPath, "tar path"))) {
      Assert-Absolute $item[0] $item[1]
    }
    if (Test-Path -LiteralPath $CapsuleRoot) { throw "capsule already exists" }
    New-Item -ItemType Directory -Path $SourceRoot -Force | Out-Null
    New-Item -ItemType Directory -Path $ControllerRoot -Force | Out-Null
    New-Item -ItemType Directory -Path $EvidenceRoot -Force | Out-Null
    $manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
    if ($manifest.identity.productCommit -ne $productCommit -or
        $manifest.identity.productTree -ne $productTree -or $manifest.identity.t7Run -ne $t7Run) {
      throw "product identity mismatch"
    }
    if ((Get-FileHash $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne
        $manifest.archiveSha256) { throw "archive digest mismatch" }
    if ((Get-FileHash $ControllerArchivePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne
        $manifest.controllerArchiveSha256) { throw "controller archive digest mismatch" }
    Invoke-Checked "extract-product" $TarPath @("-xf", $ArchivePath, "-C", $SourceRoot)
    Invoke-Checked "extract-controller" $TarPath @("-xf", $ControllerArchivePath, "-C", $ControllerRoot)
    $productFiles = Get-FileListFacts $SourceRoot "product"
    $controllerFiles = Get-FileListFacts $ControllerRoot "controller"
    if ($productFiles.count -ne $manifest.productFiles.fileCount -or
        $productFiles.sha256 -ne $manifest.productFiles.fileListSha256 -or
        $controllerFiles.count -ne $manifest.controllerFiles.fileCount -or
        $controllerFiles.sha256 -ne $manifest.controllerFiles.fileListSha256) {
      throw "archive file list mismatch"
    }
    if ((Get-FileHash (Join-Path $SourceRoot "package-lock.json") -Algorithm SHA256).Hash.ToLowerInvariant() -ne
        $manifest.lockfileSha256) { throw "lockfile digest mismatch" }
    Invoke-Checked "dependencies" $NpmPath @("ci", "--prefix", $SourceRoot)
    Invoke-Checked "electron-runtime" $NodePath @((Join-Path $SourceRoot "node_modules\electron\install.js"))
    Push-Location $SourceRoot
    try {
      Invoke-Checked "build" $NpmPath @("run", "build")
      Invoke-Checked "electron-compile" $NpmPath @("run", "electron:compile")
      Invoke-Checked "native-rebuild" $NpmPath @("run", "electron:rebuild:native")
      Invoke-Checked "native-probe" (Join-Path $SourceRoot "node_modules\electron\dist\electron.exe") `
        @((Join-Path $SourceRoot "scripts\desktop\desktop-dnssd-native-probe.cjs"))
      Invoke-Checked "package-smoke" $NpmPath @("run", "windows:package")
    } finally { Pop-Location }
    Write-Receipt @{ action = $Action; completedAt = [DateTime]::UtcNow.ToString("o")
      identity = $manifest.identity; resultStatus = "success"; schemaVersion = 2
      sourceRoot = $SourceRoot; controllerRoot = $ControllerRoot } "prepare-receipt.json"
    exit 0
  }
  Assert-Absolute $ConfigPath "interactive config"
  $runner = Join-Path $ControllerRoot "scripts\windows\t152-windows-capsule-formal-runner.mjs"
  & $NodePath $runner $ConfigPath
  if ($LASTEXITCODE -ne 0) { throw "interactive runner failed with exit $LASTEXITCODE" }
} catch {
  if ($EvidenceRoot) {
    Write-Receipt @{ action = $Action; failure = $_.Exception.Message
      resultStatus = "failed"; schemaVersion = 2 } "$Action-failure.json"
  }
  Write-Error $_
  exit 74
}
