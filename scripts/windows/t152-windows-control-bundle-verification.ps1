. (Join-Path $PSScriptRoot 't152-windows-control-bundle-collections.ps1')

function Write-FileSetReceipt([string]$File, $Value) {
  $temporary = "$File.$PID.tmp"
  [IO.File]::WriteAllText($temporary, ($Value | ConvertTo-Json -Depth 12),
    [Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $temporary -Destination $File -Force
}

function Read-ControlBundleEnvelope([string]$Token) {
  if (!$Token -or $Token -notmatch '^[A-Za-z0-9_-]+$') { throw 'verification token is invalid' }
  $base64 = $Token.Replace('-', '+').Replace('_', '/')
  while (($base64.Length % 4) -ne 0) { $base64 += '=' }
  $envelope = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($base64)) |
    ConvertFrom-Json
  $hash = Get-Sha256 ([Text.Encoding]::UTF8.GetBytes([string]$envelope.verificationJson))
  if ($envelope.verificationSha256 -notmatch '^[0-9a-f]{64}$' -or
      $hash -ne $envelope.verificationSha256) { throw 'verification envelope is invalid' }
  $value = $envelope.verificationJson | ConvertFrom-Json
  foreach ($name in @('archiveEntries', 'baseRoot', 'bundleId', 'bundlePath', 'bundleRoot',
      'bundleSha256', 'manifestSha256', 'schemaVersion', 'verificationReceiptPath')) {
    if ($null -eq $value.PSObject.Properties[$name]) { throw "verification field missing: $name" }
  }
  return [ordered]@{ envelope = $envelope; value = $value }
}

function Get-VerificationErrorFacts($Record) {
  return [ordered]@{ message = [string]$Record.Exception.Message
    offsetInLine = [int]$Record.InvocationInfo.OffsetInLine
    positionMessage = [string]$Record.InvocationInfo.PositionMessage
    scriptLineNumber = [int]$Record.InvocationInfo.ScriptLineNumber
    scriptName = [string]$Record.InvocationInfo.ScriptName
    type = $Record.Exception.GetType().FullName }
}

function Read-ControlBundleVerification([string]$Token) {
  $decoded = Read-ControlBundleEnvelope $Token
  $value = $decoded.value
  $receiptPathInput = [string]$value.verificationReceiptPath
  $receiptPathOwner = Resolve-OwnerFilesystemPath $receiptPathInput 'verification receipt'
  $receiptPath = $receiptPathOwner.normalized
  $receipt = [ordered]@{ archive = $null
    collectionSelfcheck = [ordered]@{ caseCount = 0; runtimeType = $null; state = 'not_started' }
    comparison = $null
    failure = [ordered]@{ exception = $null; messages = [object[]]@() }
    identity = [ordered]@{ bundleId = [string]$value.bundleId
      bundleSha256 = [string]$value.bundleSha256
      manifestSha256 = [string]$value.manifestSha256
      tokenSha256 = (Get-Sha256 ([Text.Encoding]::UTF8.GetBytes($Token)))
      verificationSha256 = [string]$decoded.envelope.verificationSha256 }
    manifest = $null; root = $null; schemaVersion = 2 }
  $failures = [Collections.ArrayList]::new()
  $exceptionFacts = $null
  try {
    $receipt.collectionSelfcheck = Confirm-CollectionProjectionSelfcheck
    if ($value.schemaVersion -ne 1 -or $value.bundleId -notmatch '^[0-9a-f-]{36}$' -or
        $value.bundleSha256 -notmatch '^[0-9a-f]{64}$' -or
        $value.manifestSha256 -notmatch '^[0-9a-f]{64}$') {
      throw 'verification identity is invalid'
    }
    $base = Resolve-OwnerFilesystemPath ([string]$value.baseRoot) 'verification base root'
    $archive = Resolve-OwnerFilesystemPath ([string]$value.bundlePath) 'bundle archive'
    $root = Resolve-OwnerFilesystemPath ([string]$value.bundleRoot) 'bundle root'
    foreach ($child in @($archive.normalized, $root.normalized, $receiptPath)) {
      if (![string]::Equals([IO.Path]::GetDirectoryName($child), $base.normalized,
          [StringComparison]::OrdinalIgnoreCase)) {
        throw 'bundle path escaped its dynamic base root'
      }
    }
    foreach ($item in @($base.normalized, $archive.normalized, $root.normalized)) {
      $info = Get-Item -LiteralPath $item -Force
      if (($info.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        [void]$failures.Add('verification path is a reparse point')
      }
    }
    $archiveHash = Get-Sha256 ([IO.File]::ReadAllBytes($archive.normalized))
    $manifestPath = Join-Path $root.normalized 'manifest.json'
    $manifestHash = Get-Sha256 ([IO.File]::ReadAllBytes($manifestPath))
    if ($archiveHash -ne $value.bundleSha256) { [void]$failures.Add('archive hash mismatch') }
    if ($manifestHash -ne $value.manifestSha256) { [void]$failures.Add('manifest hash mismatch') }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $fileFacts = @($manifest.fileFacts)
    $manifestNames = [Collections.ArrayList]::new()
    foreach ($fact in $fileFacts) { [void]$manifestNames.Add([string]$fact.name) }
    $expected = [Collections.ArrayList]::new()
    [void]$expected.Add('manifest.json')
    foreach ($name in $manifestNames) { [void]$expected.Add([string]$name) }
    $entryFacts = [Collections.ArrayList]::new()
    Add-EntryFacts -Root $root.normalized -Target $entryFacts
    $actual = [Collections.ArrayList]::new()
    foreach ($entry in $entryFacts) { [void]$actual.Add([string]$entry.name) }
    $compare = [Collections.ArrayList]::new()
    $missing = [Collections.ArrayList]::new()
    $extra = [Collections.ArrayList]::new()
    $expectedCollisions = [Collections.ArrayList]::new()
    $actualCollisions = [Collections.ArrayList]::new()
    Add-CompareFacts -Expected ([object[]]$expected) -Actual ([object[]]$actual) -Target $compare
    Add-NameDelta -Left ([object[]]$expected) -Right ([object[]]$actual) -Target $missing
    Add-NameDelta -Left ([object[]]$actual) -Right ([object[]]$expected) -Target $extra
    Add-NameCollisions -Values ([object[]]$expected) -Target $expectedCollisions
    Add-NameCollisions -Values ([object[]]$actual) -Target $actualCollisions
    Confirm-Projection -Missing ([object[]]$missing) -Extra ([object[]]$extra) -Collisions (
      [object[]]$expectedCollisions) -Compare ([object[]]$compare)
    Confirm-Projection -Missing ([object[]]$missing) -Extra ([object[]]$extra) -Collisions (
      [object[]]$actualCollisions) -Compare ([object[]]$compare)
    $directoryName = [IO.Path]::GetFileName($root.normalized)
    $expectedArchive = [Collections.ArrayList]::new()
    [void]$expectedArchive.Add("$directoryName/")
    foreach ($name in $expected) { [void]$expectedArchive.Add("$directoryName/$name") }
    $archiveEntries = [Collections.ArrayList]::new()
    foreach ($name in @($value.archiveEntries)) { [void]$archiveEntries.Add([string]$name) }
    $archiveCompare = [Collections.ArrayList]::new()
    $archiveMissing = [Collections.ArrayList]::new()
    $archiveExtra = [Collections.ArrayList]::new()
    $archiveExpectedCollisions = [Collections.ArrayList]::new()
    $archiveActualCollisions = [Collections.ArrayList]::new()
    Add-CompareFacts -Expected ([object[]]$expectedArchive) -Actual (
      [object[]]$archiveEntries) -Target $archiveCompare
    Add-NameDelta -Left ([object[]]$expectedArchive) -Right (
      [object[]]$archiveEntries) -Target $archiveMissing
    Add-NameDelta -Left ([object[]]$archiveEntries) -Right (
      [object[]]$expectedArchive) -Target $archiveExtra
    Add-NameCollisions -Values ([object[]]$expectedArchive) -Target $archiveExpectedCollisions
    Add-NameCollisions -Values ([object[]]$archiveEntries) -Target $archiveActualCollisions
    Confirm-Projection -Missing ([object[]]$archiveMissing) -Extra ([object[]]$archiveExtra) -Collisions (
      [object[]]$archiveExpectedCollisions) -Compare ([object[]]$archiveCompare)
    Confirm-Projection -Missing ([object[]]$archiveMissing) -Extra ([object[]]$archiveExtra) -Collisions (
      [object[]]$archiveActualCollisions) -Compare ([object[]]$archiveCompare)
    $receipt.archive = [ordered]@{ entries = $archiveEntries
      actualNameCollisions = $archiveActualCollisions; compareObjectDelta = $archiveCompare
      entriesObject = (Get-ObjectFacts $archiveEntries); expectedNameCollisions = $archiveExpectedCollisions
      extra = $archiveExtra; missing = $archiveMissing; sha256 = $archiveHash }
    $receipt.manifest = [ordered]@{ bundleId = [string]$manifest.bundleId
      fileFacts = $fileFacts; fileFactsObject = (Get-ObjectFacts $fileFacts)
      names = $manifestNames; namesObject = (Get-ObjectFacts $manifestNames)
      schemaVersion = [int]$manifest.schemaVersion; sha256 = $manifestHash }
    $receipt.root = [ordered]@{ actualEntries = $entryFacts
      actualEntriesObject = (Get-ObjectFacts $entryFacts)
      actualNameCollisions = $actualCollisions
      expectedNameCollisions = $expectedCollisions; path = $root.normalized }
    $actualNormalized = [Collections.ArrayList]::new()
    $actualSorted = [Collections.ArrayList]::new()
    $expectedNormalized = [Collections.ArrayList]::new()
    $expectedSorted = [Collections.ArrayList]::new()
    Add-NameProjection -Values ([object[]]$actual) -Target $actualNormalized
    Add-StableNames -Values ([object[]]$actual) -Target $actualSorted
    Add-NameProjection -Values ([object[]]$expected) -Target $expectedNormalized
    Add-StableNames -Values ([object[]]$expected) -Target $expectedSorted
    $receipt.comparison = [ordered]@{ actualCount = [int]$actual.Count
      actualNormalized = $actualNormalized
      actualSorted = $actualSorted
      actualObject = (Get-ObjectFacts $actual); compareObjectDelta = $compare
      compareObjectDeltaObject = (Get-ObjectFacts $compare)
      expectedCount = [int]$expected.Count
      expectedNormalized = $expectedNormalized
      expectedSorted = $expectedSorted
      expectedObject = (Get-ObjectFacts $expected)
      extra = $extra; missing = $missing }
    if ($manifest.schemaVersion -ne 1 -or $manifest.bundleId -ne $value.bundleId) {
      [void]$failures.Add('manifest identity mismatch')
    }
    if ($missing.Count -or $extra.Count -or $expectedCollisions.Count -or
        $actualCollisions.Count -or $archiveMissing.Count -or $archiveExtra.Count) {
      [void]$failures.Add('bundle file set mismatch')
    }
    foreach ($entry in $entryFacts) {
      if ($entry.type -ne 'file' -or $entry.reparsePoint) {
        [void]$failures.Add("invalid bundle entry: $($entry.name)")
      }
    }
    foreach ($fact in $fileFacts) {
      $file = Join-Path $root.normalized ([string]$fact.name)
      if ([IO.Path]::GetFileName([string]$fact.name) -ne [string]$fact.name -or
          $fact.sha256 -notmatch '^[0-9a-f]{64}$' -or
          (Get-Sha256 ([IO.File]::ReadAllBytes($file))) -ne $fact.sha256) {
        [void]$failures.Add("invalid bundle fact: $($fact.name)")
      }
    }
  } catch {
    $exceptionFacts = Get-VerificationErrorFacts $_
    if ($receipt.collectionSelfcheck.state -eq 'not_started') {
      $receipt.collectionSelfcheck = [ordered]@{ caseCount = 0; runtimeType = $null
        state = 'failure' }
    }
    [void]$failures.Add($exceptionFacts.message)
  }
  $receipt.failure = if ($failures.Count) {
    [ordered]@{ exception = $exceptionFacts; messages = $failures }
  } else { $null }
  Write-FileSetReceipt $receiptPath $receipt
  if ($failures.Count) { throw ($failures -join '; ') }
  return $receipt
}
