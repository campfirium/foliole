param(
  [string]$WindowsWorkDir = "C:\dev\foliole-android-preview",
  [string]$AndroidHostDir = "android",
  [string]$CapCliPackage = "@capacitor/cli",
  [ValidateSet("auto", "skip", "force", "ci")]
  [string]$DependencyRefresh = "auto"
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\windows-hash-helpers.ps1"

function Write-Info {
  param([string]$Message)
  Write-Host "[android-cap-sync] $Message"
}

function Test-LastCommandFailed {
  return $null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0
}

function Invoke-CmdTool {
  param(
    [string]$CommandPath,
    [string[]]$Arguments,
    [string]$FailureMessage
  )
  $toolDir = Split-Path -Parent $CommandPath
  if ($env:Path -notlike "*$toolDir*") {
    $env:Path = "$toolDir;$env:Path"
  }
  $out = [System.IO.Path]::GetTempFileName(); $err = [System.IO.Path]::GetTempFileName()
  try {
    $process = Start-Process `
      -ArgumentList $Arguments `
      -FilePath $CommandPath `
      -PassThru `
      -RedirectStandardError $err `
      -RedirectStandardOutput $out `
      -Wait `
      -WindowStyle Hidden `
      -WorkingDirectory $WindowsWorkDir
    $out, $err | ForEach-Object { Get-Content -Path $_ -ErrorAction SilentlyContinue }
    if ($process.ExitCode -ne 0) { throw $FailureMessage }
  } finally { Remove-Item -Path $out, $err -ErrorAction SilentlyContinue }
}

function Invoke-NodeTool {
  param(
    [string[]]$Arguments,
    [string]$FailureMessage
  )
  $nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($null -eq $nodeCmd) {
    throw "node.exe not found on Windows. Install Node.js on Windows first."
  }
  Invoke-CmdTool -CommandPath $nodeCmd.Source -Arguments $Arguments -FailureMessage $FailureMessage
}

function Assert-FileExists {
  param(
    [string]$Path,
    [string]$FailureMessage
  )
  if (!(Test-Path -Path $Path -PathType Leaf)) {
    throw $FailureMessage
  }
}
$androidDir = Join-Path $WindowsWorkDir $AndroidHostDir
if (!(Test-Path -Path $androidDir)) {
  throw "Android host not initialized: $androidDir. Create the Capacitor Android host first."
}

function Get-RelativePath {
  param([string]$Path)
  $basePath = [System.IO.Path]::GetFullPath($WindowsWorkDir).TrimEnd('\') + '\'
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  if ($fullPath.StartsWith($basePath, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $fullPath.Substring($basePath.Length).Replace('\', '/')
  }
  return $fullPath.Replace('\', '/')
}

function Test-CapSyncInputFile {
  param([System.IO.FileInfo]$File)
  $relativePath = Get-RelativePath -Path $File.FullName
  return $relativePath -notmatch '(^|/)(__tests__|test-results|coverage)/' `
    -and $relativePath -notmatch '\.(test|spec)\.[^/]+$'
}

function Get-InputFiles {
  $paths = @(
    "package.json",
    "package-lock.json",
    "vite.companion.config.ts", "vite.shared.ts", "tailwind.config.js", "index.html", "capacitor.config.ts",
    "electron\startupSkeletonLayout.ts", "src\app\styles.css", "src\app\tokens", "src\app\generated\appearance-colors.css", "public\favicon.ico", "public\favicon.png",
    "src\companion",
    "src\shared",
    "src\features",
    "lib",
    "scripts\android\generate-companion-schema.mjs", "scripts\android\ts-js-extension-loader.mjs", "scripts\android\android-query-shape-java.mjs", "scripts\android\android-resource-query-string-java.mjs",
    "scripts\android\windows-cap-sync.ps1", "scripts\android\windows-cap-sync-dependencies.ps1", "scripts\android\windows-hash-helpers.ps1"
  )
  $files = @()
  foreach ($relativePath in $paths) {
    $fullPath = Join-Path $WindowsWorkDir $relativePath
    if (Test-Path -Path $fullPath -PathType Leaf) {
      $files += Get-Item -Path $fullPath
    } elseif (Test-Path -Path $fullPath -PathType Container) {
      $files += Get-ChildItem -Path $fullPath -File -Recurse
    }
  }
  return $files | Where-Object { Test-CapSyncInputFile -File $_ } | Sort-Object FullName
}
function Get-CapSyncInputHash {
  $lines = foreach ($file in Get-InputFiles) {
    $hash = Get-Sha256FileHash -Path $file.FullName
    "$(Get-RelativePath -Path $file.FullName)=$hash"
  }
  $payload = ($lines -join "`n") + "`nenv:VITE_FOLIOLE_DEV_APP_LANGUAGE=$($env:VITE_FOLIOLE_DEV_APP_LANGUAGE);VITE_FOLIOLE_INTERNAL_BUILD=$($env:VITE_FOLIOLE_INTERNAL_BUILD)"
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  return ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
}
function Get-CachePath {
  $cacheDir = Join-Path $WindowsWorkDir ".lab\internal\runtime"
  New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null
  return Join-Path $cacheDir "android-cap-sync-cache.json"
}

function Read-CapSyncCache {
  param([string]$Path)
  try {
    return Get-Content -Path $Path -Raw | ConvertFrom-Json
  } catch {
    Write-Info "cache: unreadable; treating as MISS path=$(Get-RelativePath -Path $Path)"
    return $null
  }
}

function Test-CapSyncCacheHit {
  param([string]$InputHash)
  $cachePath = Get-CachePath
  $webMarker = Join-Path $WindowsWorkDir "dist\companion\index.html"
  $assetMarker = Join-Path $WindowsWorkDir "android\app\src\main\assets\public\index.html"
  if (!(Test-Path -Path $cachePath) -or !(Test-Path -Path $webMarker) -or !(Test-Path -Path $assetMarker)) {
    return $false
  }
  $cache = Read-CapSyncCache -Path $cachePath
  if ($null -eq $cache) {
    return $false
  }
  return $cache.inputHash -eq $InputHash -and $cache.status -eq "ok" -and $cache.version -eq 1
}

function Write-CapSyncCache {
  param([string]$InputHash)
  $payload = @{ inputHash = $InputHash; status = "ok"; timestamp = (Get-Date).ToUniversalTime().ToString("o"); version = 1 }
  $cachePath = Get-CachePath
  $temporaryPath = "$cachePath.$PID.tmp"
  $payload | ConvertTo-Json | Set-Content -Path $temporaryPath -Encoding UTF8
  Move-Item -Path $temporaryPath -Destination $cachePath -Force
}

. "$PSScriptRoot\windows-cap-sync-dependencies.ps1"

Push-Location $WindowsWorkDir
try {
  Write-Info "workdir: $WindowsWorkDir"
  Sync-WindowsMirrorDependencies
  Ensure-CapacitorCliAvailable
  $inputHash = Get-CapSyncInputHash
  if (Test-CapSyncCacheHit -InputHash $inputHash) {
    Write-Info "cache: HIT input=$inputHash"
    Write-Info "status: SYNCED"
    return
  }
  Write-Info "cache: MISS input=$inputHash"
  Write-Info "building companion web entry"
  $webOutDir = Join-Path $WindowsWorkDir "dist\companion"
  if (Test-Path -Path $webOutDir) {
    Remove-Item -Path $webOutDir -Recurse -Force
  }
  Invoke-NodeTool -Arguments @("--experimental-loader", "./scripts/android/ts-js-extension-loader.mjs", "scripts\android\generate-companion-schema.mjs") -FailureMessage "Android companion schema generation failed."
  Invoke-NodeTool -Arguments @("node_modules\vite\bin\vite.js", "build", "--config", "vite.companion.config.ts") -FailureMessage "Android companion web build failed."
  Assert-FileExists `
    -Path (Join-Path $WindowsWorkDir "dist\companion\index.html") `
    -FailureMessage "Android companion web build did not produce dist\companion\index.html."
  $capCliPath = Join-Path $WindowsWorkDir "node_modules\@capacitor\cli\bin\capacitor"
  if (!(Test-Path -Path $capCliPath -PathType Leaf)) {
    throw "Capacitor CLI missing in Windows mirror; cannot run Capacitor sync."
  }
  $androidPublicDir = Join-Path $WindowsWorkDir "android\app\src\main\assets\public"
  if (Test-Path -Path $androidPublicDir) {
    Remove-Item -Path $androidPublicDir -Recurse -Force
  }
  Invoke-NodeTool -Arguments @($capCliPath, "sync", "android") -FailureMessage "Capacitor Android sync failed."
  Assert-FileExists `
    -Path (Join-Path $WindowsWorkDir "android\app\src\main\assets\public\index.html") `
    -FailureMessage "Capacitor Android sync did not produce android app web assets."
  Write-CapSyncCache -InputHash $inputHash
  Write-Info "status: SYNCED"
} finally {
  Pop-Location
}
