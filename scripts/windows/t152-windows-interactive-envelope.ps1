function ConvertFrom-T152Base64Url([string]$Token, [string]$Label) {
  if (!$Token -or $Token -notmatch '^[A-Za-z0-9_-]+$') { throw "$Label token is invalid" }
  $base64 = $Token.Replace('-', '+').Replace('_', '/')
  while (($base64.Length % 4) -ne 0) { $base64 += '=' }
  try { return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($base64)) }
  catch { throw "$Label token decoding failed" }
}

function Confirm-T152InteractiveIdentity($Config, [string]$ExpectedAction) {
  $required = @('action', 'baseRoot', 'capsuleId', 'capsuleRoot', 'configPath',
    'controllerCommit', 'controllerRoot', 'controllerTree', 'entryMode', 'evidenceRoot',
    'formalAttempt', 'g1', 'launchEnvHash', 'nodePath', 'nonce', 'ownerReceiptPath', 'phase',
    'productCommit', 'productTree', 'protectedRoots', 'rootId', 'schemaVersion', 'sourceRoot',
    'stateRoot', 't7Run')
  foreach ($name in $required) {
    if ($null -eq $Config.PSObject.Properties[$name]) { throw "interactive field missing: $name" }
  }
  if ($Config.schemaVersion -ne 1 -or $Config.phase -ne $ExpectedAction -or
      $Config.entryMode -notin @('execute', 'projection') -or
      $Config.capsuleId -notmatch '^[0-9a-f-]{36}$' -or
      $Config.rootId -notmatch '^[0-9a-f-]{36}$' -or
      $Config.controllerCommit -notmatch '^[0-9a-f]{40}$' -or
      $Config.controllerTree -notmatch '^[0-9a-f]{40}$' -or
      $Config.productCommit -ne $productCommit -or $Config.productTree -ne $productTree -or
      $Config.t7Run -ne $t7Run -or $Config.launchEnvHash -notmatch '^[0-9a-f]{64}$') {
    throw 'interactive identity is invalid'
  }
  $admission = $ExpectedAction -in @('g2-path', 'g3-anchor')
  if ($admission -and ($Config.action -ne 't152-prejourney-admission' -or
      $Config.formalAttempt.allocated -ne $false -or $Config.formalAttempt.started -ne $false)) {
    throw 'interactive admission identity is invalid'
  }
  if ($ExpectedAction -eq 'formal' -and $Config.entryMode -eq 'execute' -and
      ($Config.attemptId -ne $Config.rootId -or $Config.formalAttempt.allocated -ne $true -or
      $Config.formalAttempt.started -ne $true)) { throw 'interactive formal identity is invalid' }
  if ($ExpectedAction -eq 'formal' -and $Config.entryMode -eq 'projection' -and
      ($Config.formalAttempt.allocated -ne $false -or $Config.formalAttempt.started -ne $false)) {
    throw 'interactive formal projection allocated an attempt'
  }
  if ($Config.entryMode -eq 'projection' -and
      $null -eq $Config.PSObject.Properties['projectionReceiptPath']) {
    throw 'interactive projection receipt path is missing'
  }
}

function Confirm-T152InteractivePaths($Config) {
  $names = @('baseRoot', 'capsuleRoot', 'configPath', 'controllerRoot', 'evidenceRoot',
    'nodePath', 'ownerReceiptPath', 'sourceRoot', 'stateRoot')
  if ($Config.entryMode -eq 'projection') { $names += 'projectionReceiptPath' }
  $paths = [ordered]@{}
  foreach ($name in $names) {
    $paths[$name] = Resolve-OwnerFilesystemPath ([string]$Config.$name) "interactive.$name"
  }
  foreach ($root in @($Config.protectedRoots)) {
    Resolve-OwnerFilesystemPath ([string]$root) 'interactive.protectedRoot' | Out-Null
  }
  $configPath = [IO.Path]::GetFullPath($paths.configPath.normalized)
  $capsulePrefix = $paths.capsuleRoot.normalized.TrimEnd('\') + '\'
  if (!$configPath.StartsWith($capsulePrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'interactive config path escaped its capsule owner'
  }
  $relative = $configPath.Substring($capsulePrefix.Length)
  if ($relative.StartsWith('..') -or $relative -notmatch '^control\\interactive\\') {
    throw 'interactive config path escaped its capsule owner'
  }
  if ($Config.entryMode -eq 'projection') {
    $receiptPath = [IO.Path]::GetFullPath($paths.projectionReceiptPath.normalized)
    if (!$receiptPath.StartsWith($capsulePrefix, [StringComparison]::OrdinalIgnoreCase) -or
        $receiptPath.Substring($capsulePrefix.Length) -notmatch '^control\\interactive\\') {
      throw 'interactive projection receipt path escaped its capsule owner'
    }
  }
  if (!(Test-Path -LiteralPath $paths.nodePath.normalized -PathType Leaf)) {
    throw 'interactive node path is unavailable'
  }
  return $paths
}

function Confirm-T152G1Binding($Config) {
  foreach ($name in @('finalizeReceiptPath', 'planSha256', 'requestSha256', 'tokenSha256')) {
    if ($null -eq $Config.g1.PSObject.Properties[$name]) { throw "G1 binding missing: $name" }
  }
  $receiptPath = (Resolve-OwnerFilesystemPath ([string]$Config.g1.finalizeReceiptPath
    ) 'G1 finalize receipt').normalized
  if (!(Test-Path -LiteralPath $receiptPath -PathType Leaf)) { throw 'G1 finalize receipt is missing' }
  $receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
  if ($receipt.resultStatus -ne 'success' -or $receipt.stage -ne 'finalize' -or
      $receipt.requestSha256 -ne $Config.g1.requestSha256 -or
      $receipt.tokenSha256 -ne $Config.g1.tokenSha256 -or
      $receipt.planSha256 -ne $Config.g1.planSha256 -or
      $receipt.capsuleId -ne $Config.capsuleId -or $receipt.rootId -ne $Config.rootId -or
      $receipt.identity.controllerCommit -ne $Config.controllerCommit -or
      $receipt.identity.controllerTree -ne $Config.controllerTree -or
      $receipt.identity.productCommit -ne $Config.productCommit -or
      $receipt.identity.productTree -ne $Config.productTree -or
      $receipt.identity.t7Run -ne $Config.t7Run) { throw 'G1 binding diverged from its terminal receipt' }
  return [ordered]@{ finalizeReceiptPath = $receiptPath; planSha256 = $Config.g1.planSha256
    requestSha256 = $Config.g1.requestSha256; tokenSha256 = $Config.g1.tokenSha256 }
}

function Write-T152InteractiveConfig([string]$ConfigJson, [string]$ConfigPath) {
  if (Test-Path -LiteralPath $ConfigPath) { throw 'interactive config already exists' }
  $parent = [IO.Path]::GetDirectoryName($ConfigPath)
  [IO.Directory]::CreateDirectory($parent) | Out-Null
  $temporary = "$ConfigPath.$PID.tmp"
  [IO.File]::WriteAllText($temporary, $ConfigJson, [Text.UTF8Encoding]::new($false))
  [IO.File]::Move($temporary, $ConfigPath)
  return Get-Sha256 ([IO.File]::ReadAllBytes($ConfigPath))
}

function Write-T152InteractiveProjectionReceipt($Interactive) {
  $receiptPath = $Interactive.paths.projectionReceiptPath.normalized
  if (Test-Path -LiteralPath $receiptPath) { throw 'interactive projection receipt already exists' }
  $configBytes = [IO.File]::ReadAllBytes($Interactive.configPath)
  $config = $Interactive.config
  $receipt = [ordered]@{ schemaVersion = 1; action = $config.action
    configRawBase64 = [Convert]::ToBase64String($configBytes)
    configSha256 = $Interactive.configSha256; entryMode = $config.entryMode
    formalAttempt = $config.formalAttempt; g1 = $Interactive.g1
    identity = [ordered]@{ capsuleId = $config.capsuleId
      controllerCommit = $config.controllerCommit; controllerTree = $config.controllerTree
      productCommit = $config.productCommit; productTree = $config.productTree
      rootId = $config.rootId; t7Run = $config.t7Run }
    materializedSha256 = $Interactive.materializedSha256; paths = $Interactive.paths
    phase = $config.phase; productStarted = $false
    projectionReceiptPath = $receiptPath; scheduledWorkerStarted = $false
    tokenSha256 = $Interactive.tokenSha256 }
  $parent = [IO.Path]::GetDirectoryName($receiptPath)
  [IO.Directory]::CreateDirectory($parent) | Out-Null
  $temporary = "$receiptPath.$PID.tmp"
  [IO.File]::WriteAllText($temporary, ($receipt | ConvertTo-Json -Compress -Depth 8),
    [Text.UTF8Encoding]::new($false))
  [IO.File]::Move($temporary, $receiptPath)
  return Get-Sha256 ([IO.File]::ReadAllBytes($receiptPath))
}

function Read-T152InteractiveEnvelope([string]$Token, [string]$ExpectedAction) {
  $envelopeJson = ConvertFrom-T152Base64Url $Token 'interactive'
  $envelope = $envelopeJson | ConvertFrom-Json
  if ($envelope.schemaVersion -ne 1 -or $envelope.configSha256 -notmatch '^[0-9a-f]{64}$' -or
      (Get-Sha256 ([Text.Encoding]::UTF8.GetBytes([string]$envelope.configJson))) -ne
      $envelope.configSha256) { throw 'interactive envelope hash mismatch' }
  $config = $envelope.configJson | ConvertFrom-Json
  Confirm-T152InteractiveIdentity $config $ExpectedAction
  $paths = Confirm-T152InteractivePaths $config
  $g1 = Confirm-T152G1Binding $config
  $materializedSha256 = Write-T152InteractiveConfig ([string]$envelope.configJson
    ) $paths.configPath.normalized
  return [ordered]@{ action = $ExpectedAction; config = $config
    configPath = $paths.configPath.normalized; configSha256 = $envelope.configSha256; g1 = $g1
    materializedSha256 = $materializedSha256; paths = $paths
    tokenSha256 = (Get-Sha256 ([Text.Encoding]::UTF8.GetBytes($Token))) }
}
