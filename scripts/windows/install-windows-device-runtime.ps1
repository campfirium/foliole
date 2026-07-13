param([string]$Version = "22.23.1")

$ErrorActionPreference = "Stop"
$deviceRoot = Join-Path $env:LOCALAPPDATA "Foliole\windows-device"
$runtimeRoot = Join-Path $deviceRoot "runtime"
$archiveName = "node-v$Version-win-x64.zip"
$releaseRoot = "https://nodejs.org/dist/v$Version"
$archivePath = Join-Path $env:TEMP $archiveName
$checksumsPath = Join-Path $env:TEMP "node-v$Version-SHASUMS256.txt"

New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
Invoke-WebRequest "$releaseRoot/SHASUMS256.txt" -OutFile $checksumsPath
Invoke-WebRequest "$releaseRoot/$archiveName" -OutFile $archivePath
$record = Get-Content $checksumsPath | Where-Object { $_ -match "^[0-9a-f]{64}\s+$([regex]::Escape($archiveName))$" }
if (-not $record) { throw "Node checksum record was not found for $archiveName" }
$expectedHash = ($record -split "\s+")[0]
$actualHash = (Get-FileHash -Algorithm SHA256 $archivePath).Hash.ToLowerInvariant()
if ($actualHash -ne $expectedHash) { throw "Node runtime checksum mismatch" }

$destination = Join-Path $runtimeRoot "node-v$Version-win-x64"
Remove-Item $destination -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive -Path $archivePath -DestinationPath $runtimeRoot -Force
$nodePath = Join-Path $destination "node.exe"
if (-not (Test-Path $nodePath)) { throw "Node runtime was not extracted: $nodePath" }
Set-Content -Path (Join-Path $deviceRoot "node-path.txt") -Value $nodePath -NoNewline
& $nodePath --version
