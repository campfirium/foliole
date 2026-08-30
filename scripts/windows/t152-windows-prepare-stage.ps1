function Get-T152Sha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Write-T152JsonAtomic([string]$Path, [object]$Value) {
  $temporary = "$Path.$PID.tmp"
  $json = $Value | ConvertTo-Json -Depth 12
  [IO.File]::WriteAllText($temporary, $json, [Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $temporary -Destination $Path -Force
}

function Invoke-T152Checked([string]$Name, [string]$File, [string[]]$Arguments,
    [string]$EvidenceRoot) {
  $output = @(& $File @Arguments 2>&1)
  $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
  $log = Join-Path $EvidenceRoot "$Name.log"
  [IO.File]::WriteAllLines($log, @($output | ForEach-Object { [string]$_ }),
    [Text.UTF8Encoding]::new($false))
  if ($exitCode -ne 0) {
    $error = [Exception]::new("$Name failed with exit $exitCode")
    $error.Data['RawExit'] = $exitCode
    throw $error
  }
  return [ordered]@{ exit = $exitCode; log = $log; logSha256 = Get-T152Sha256 $log }
}

function Get-T152FileListFacts([string]$Root, [string]$Name, [string]$EvidenceRoot) {
  [string[]]$files = @(Get-ChildItem -LiteralPath $Root -File -Recurse | ForEach-Object {
    $_.FullName.Substring($Root.Length + 1).Replace('\', '/') })
  [Array]::Sort($files, [StringComparer]::Ordinal)
  $listPath = Join-Path $EvidenceRoot "$Name-files.txt"
  [IO.File]::WriteAllText($listPath, ([string]::Join("`n", $files) + "`n"),
    [Text.UTF8Encoding]::new($false))
  return [ordered]@{ count = $files.Count; sha256 = Get-T152Sha256 $listPath }
}

function Assert-T152Manifest([object]$Request) {
  $manifest = Get-Content -LiteralPath $Request.manifestPath -Raw | ConvertFrom-Json
  if ($manifest.identity.productCommit -ne $Request.identity.productCommit -or
      $manifest.identity.productTree -ne $Request.identity.productTree -or
      $manifest.identity.t7Run -ne $Request.identity.t7Run -or
      $manifest.identity.controllerCommit -ne $Request.identity.controllerCommit -or
      $manifest.identity.controllerTree -ne $Request.identity.controllerTree) {
    throw 'prepare manifest identity mismatch'
  }
  return $manifest
}

function Invoke-T152StageWork([string]$Stage, [object]$Request, [object]$Manifest) {
  $evidence = [string]$Request.evidenceRoot
  switch ($Stage) {
    'materialize' {
      if (Test-Path -LiteralPath $Request.capsuleRoot) { throw 'capsule already exists' }
      New-Item -ItemType Directory -Path $Request.sourceRoot -Force | Out-Null
      New-Item -ItemType Directory -Path $Request.controllerRoot -Force | Out-Null
      New-Item -ItemType Directory -Path $evidence -Force | Out-Null
      if ((Get-T152Sha256 $Request.productArchivePath) -ne $Manifest.archiveSha256 -or
          (Get-T152Sha256 $Request.controllerArchivePath) -ne $Manifest.controllerArchiveSha256) {
        throw 'prepare archive digest mismatch'
      }
      $product = Invoke-T152Checked 'extract-product' $Request.tarPath @(
        '-xf', $Request.productArchivePath, '-C', $Request.sourceRoot) $evidence
      $controller = Invoke-T152Checked 'extract-controller' $Request.tarPath @(
        '-xf', $Request.controllerArchivePath, '-C', $Request.controllerRoot) $evidence
      $productFiles = Get-T152FileListFacts $Request.sourceRoot 'product' $evidence
      $controllerFiles = Get-T152FileListFacts $Request.controllerRoot 'controller' $evidence
      if ($productFiles.count -ne $Manifest.productFiles.fileCount -or
          $productFiles.sha256 -ne $Manifest.productFiles.fileListSha256 -or
          $controllerFiles.count -ne $Manifest.controllerFiles.fileCount -or
          $controllerFiles.sha256 -ne $Manifest.controllerFiles.fileListSha256 -or
          (Get-T152Sha256 (Join-Path $Request.sourceRoot 'package-lock.json')) -ne
            $Manifest.lockfileSha256) { throw 'prepare archive content mismatch' }
      return [ordered]@{ controllerFiles = $controllerFiles; extract = @($product, $controller)
        productFiles = $productFiles }
    }
    'dependencies' { return Invoke-T152Checked $Stage $Request.npmPath @(
      '--prefix', $Request.sourceRoot, 'ci') $evidence }
    'electron-runtime' { return Invoke-T152Checked $Stage $Request.nodePath @(
      (Join-Path $Request.sourceRoot 'node_modules\electron\install.js')) $evidence }
    'build' { return Invoke-T152Checked $Stage $Request.npmPath @(
      '--prefix', $Request.sourceRoot, 'run', 'build') $evidence }
    'electron-compile' { return Invoke-T152Checked $Stage $Request.npmPath @(
      '--prefix', $Request.sourceRoot, 'run', 'electron:compile') $evidence }
    'native' {
      $rebuild = Invoke-T152Checked 'native-rebuild' $Request.npmPath @(
        '--prefix', $Request.sourceRoot, 'run', 'electron:rebuild:native') $evidence
      $probe = Invoke-T152Checked 'native-probe' (Join-Path $Request.sourceRoot `
        'node_modules\electron\dist\electron.exe') @((Join-Path $Request.sourceRoot `
        'scripts\desktop\desktop-dnssd-native-probe.cjs')) $evidence
      return [ordered]@{ probe = $probe; rebuild = $rebuild }
    }
    'package' { return Invoke-T152Checked 'package-smoke' $Request.npmPath @(
      '--prefix', $Request.sourceRoot, 'run', 'windows:package') $evidence }
    'finalize' { return [ordered]@{ controllerRoot = $Request.controllerRoot
      sourceRoot = $Request.sourceRoot; terminal = $true } }
  }
  throw 'prepare stage is invalid'
}

function Invoke-T152PrepareStage([string]$Action, [object]$Binding) {
  $stages = @('materialize', 'dependencies', 'electron-runtime', 'build',
    'electron-compile', 'native', 'package', 'finalize')
  $stage = $Action.Substring('prepare-'.Length)
  $index = [Array]::IndexOf($stages, $stage)
  if ($index -lt 0) { throw 'prepare stage is invalid' }
  $request = $Binding.request
  $receiptPath = Join-Path $request.evidenceRoot "prepare-$stage-receipt.json"
  if (Test-Path -LiteralPath $receiptPath) { throw 'prepare stage receipt already exists' }
  $previousHash = $null
  if ($index -gt 0) {
    $previous = Join-Path $request.evidenceRoot "prepare-$($stages[$index - 1])-receipt.json"
    if (!(Test-Path -LiteralPath $previous -PathType Leaf)) { throw 'prepare predecessor is missing' }
    $previousValue = Get-Content -LiteralPath $previous -Raw | ConvertFrom-Json
    if ($previousValue.resultStatus -ne 'success' -or
        $previousValue.stage -ne $stages[$index - 1]) { throw 'prepare predecessor is invalid' }
    $previousHash = Get-T152Sha256 $previous
  }
  $started = [DateTime]::UtcNow
  $rawExit = 0
  try {
    $manifest = Assert-T152Manifest $request
    $facts = Invoke-T152StageWork $stage $request $manifest
    $status = 'success'; $failure = $null
  } catch {
    $status = 'failed'; $failure = $_.Exception.Message
    if ($_.Exception.Data.Contains('RawExit')) { $rawExit = $_.Exception.Data['RawExit'] }
  }
  $ended = [DateTime]::UtcNow
  if (!(Test-Path -LiteralPath $request.evidenceRoot)) {
    New-Item -ItemType Directory -Path $request.evidenceRoot -Force | Out-Null
  }
  $receipt = [ordered]@{ capsuleId = $request.capsuleId; capsuleRoot = $request.capsuleRoot
    durationMs = [int](
      $ended - $started).TotalMilliseconds; endedAt = $ended.ToString('o'); facts = $facts
    failure = $failure; identity = $request.identity; predecessorReceiptSha256 = $previousHash
    hostFactsSha256 = $request.hostFactsSha256; rawExit = $rawExit; rawSignal = $null
    requestSha256 = $Binding.requestSha256
    resultStatus = $status; rootId = $request.rootId; schemaVersion = 1; stage = $stage
    startedAt = $started.ToString('o'); tokenSha256 = $Binding.tokenSha256 }
  Write-T152JsonAtomic $receiptPath $receipt
  Write-Output "T152_PREPARE_STAGE=$($receipt | ConvertTo-Json -Compress -Depth 8)"
  if ($status -ne 'success') { throw $failure }
}
