param(
  [string]$WorkDir = "C:\dev\foliole"
)

$ErrorActionPreference = "Stop"

$previousLocation = Get-Location
try {
  Set-Location -LiteralPath $WorkDir
  npm.cmd run electron:rebuild:native
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  Set-Location -Path $previousLocation
}
