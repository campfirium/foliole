param(
  [Parameter(Mandatory = $true)]
  [string]$VerificationBase64
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-ScriptSha256([string]$File) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { $hash = $sha.ComputeHash([IO.File]::ReadAllBytes($File)) }
  finally { $sha.Dispose() }
  return ([BitConverter]::ToString($hash)).Replace('-', '').ToLowerInvariant()
}

function New-ScriptFactList {
  $value = [Collections.ArrayList]::new()
  Write-Output -NoEnumerate $value
}

function Read-ParserEnvelope([string]$Token) {
  if (!$Token -or $Token -notmatch '^[A-Za-z0-9_-]+$') { throw 'parser token is invalid' }
  $base64 = $Token.Replace('-', '+').Replace('_', '/')
  while (($base64.Length % 4) -ne 0) { $base64 += '=' }
  $text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($base64))
  $envelope = $text | ConvertFrom-Json
  $temporary = [IO.Path]::GetTempFileName()
  try {
    [IO.File]::WriteAllText($temporary, [string]$envelope.verificationJson,
      [Text.UTF8Encoding]::new($false))
    $hash = Get-ScriptSha256 $temporary
  } finally { Remove-Item -LiteralPath $temporary -Force }
  if ($hash -ne $envelope.verificationSha256) { throw 'parser envelope hash mismatch' }
  return $envelope.verificationJson | ConvertFrom-Json
}

function Get-ParserErrorFacts($Errors) {
  $facts = New-ScriptFactList
  foreach ($error in @($Errors)) {
    [void]$facts.Add([ordered]@{ errorId = [string]$error.ErrorId
      extent = [ordered]@{ endColumn = [int]$error.Extent.EndColumnNumber
        endLine = [int]$error.Extent.EndLineNumber
        startColumn = [int]$error.Extent.StartColumnNumber
        startLine = [int]$error.Extent.StartLineNumber; text = [string]$error.Extent.Text }
      message = [string]$error.Message })
  }
  return ,$facts
}

try {
  $value = Read-ParserEnvelope $VerificationBase64
  $root = [IO.Path]::GetFullPath([string]$value.bundleRoot)
  $manifestPath = Join-Path $root 'manifest.json'
  if ((Get-ScriptSha256 $manifestPath) -ne $value.manifestSha256) {
    throw 'parser manifest hash mismatch'
  }
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  $scripts = New-ScriptFactList
  foreach ($fact in @($manifest.fileFacts | Where-Object { $_.name -like '*.ps1' })) {
    $name = [string]$fact.name
    if ([IO.Path]::GetFileName($name) -ne $name) { throw 'parser script name is invalid' }
    $file = Join-Path $root $name
    $sha256 = Get-ScriptSha256 $file
    if ($sha256 -ne $fact.sha256) { throw "parser script hash mismatch: $name" }
    $tokens = $null
    $errors = $null
    $ast = [Management.Automation.Language.Parser]::ParseFile($file, [ref]$tokens, [ref]$errors)
    $errorFacts = Get-ParserErrorFacts $errors
    [void]$scripts.Add([ordered]@{ astExtent = [ordered]@{
        endOffset = [int]$ast.Extent.EndOffset; startOffset = [int]$ast.Extent.StartOffset
        textLength = [int]$ast.Extent.Text.Length }
      errors = $errorFacts; errorsRuntimeType = $errorFacts.GetType().FullName
      file = $name; sha256 = $sha256 })
  }
  $receipt = [ordered]@{ clrVersion = [Environment]::Version.ToString()
    powershellVersion = $PSVersionTable.PSVersion.ToString(); schemaVersion = 1
    scripts = $scripts }
  Write-Output "T152_SCRIPT_PARSE=$($receipt | ConvertTo-Json -Compress -Depth 10)"
  if (@($scripts | Where-Object { $_.errors.Count -ne 0 }).Count -ne 0) { exit 73 }
  exit 0
} catch { Write-Error $_; exit 74 }
