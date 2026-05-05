param(
  [string]$WindowsWorkDir = "C:\dev\foliole-android-preview",
  [string]$AndroidHostDir = "android",
  [string]$AndroidWebBuildScript = "android:web:build",
  [string]$CapCliPackage = "@capacitor/cli",
  [string]$CapCliVersion = "8.3.0",
  [ValidateSet("auto", "skip", "force")]
  [string]$DependencyRefresh = "auto"
)

$ErrorActionPreference = "Stop"

function Write-Info {
  param([string]$Message)
  Write-Host "[android-cap-sync] $Message"
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

function Get-InputFiles {
  $paths = @(
    "package.json",
    "package-lock.json",
    "vite.companion.config.ts",
    "capacitor.config.ts",
    "src\companion",
    "src\shared",
    "src\features",
    "lib",
    "scripts\android\generate-companion-schema.mjs",
    "scripts\android\windows-cap-sync.ps1"
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
  return $files | Sort-Object FullName
}

function Get-CapSyncInputHash {
  $lines = foreach ($file in Get-InputFiles) {
    $hash = (Get-FileHash -Algorithm SHA256 -Path $file.FullName).Hash
    "$(Get-RelativePath -Path $file.FullName)=$hash"
  }
  $payload = ($lines -join "`n")
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  return ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
}

function Get-CachePath {
  $cacheDir = Join-Path $WindowsWorkDir ".lab\internal\runtime"
  New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null
  return Join-Path $cacheDir "android-cap-sync-cache.json"
}

function Test-CapSyncCacheHit {
  param([string]$InputHash)
  $cachePath = Get-CachePath
  $webMarker = Join-Path $WindowsWorkDir "dist\companion\index.html"
  $assetMarker = Join-Path $WindowsWorkDir "android\app\src\main\assets\public\index.html"
  if (!(Test-Path -Path $cachePath) -or !(Test-Path -Path $webMarker) -or !(Test-Path -Path $assetMarker)) {
    return $false
  }
  $cache = Get-Content -Path $cachePath -Raw | ConvertFrom-Json
  return $cache.inputHash -eq $InputHash -and $cache.status -eq "ok" -and $cache.version -eq 1
}

function Write-CapSyncCache {
  param([string]$InputHash)
  $payload = @{ inputHash = $InputHash; status = "ok"; timestamp = (Get-Date).ToUniversalTime().ToString("o"); version = 1 }
  $payload | ConvertTo-Json | Set-Content -Path (Get-CachePath) -Encoding UTF8
}

function Ensure-CapacitorCliAvailable {
  $cliPackageJson = Join-Path $WindowsWorkDir "node_modules\$($CapCliPackage -replace '/', '\')\package.json"
  if (Test-Path -Path $cliPackageJson) {
    return
  }

  $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($null -eq $npmCmd) {
    throw "npm.cmd not found on Windows. Install Node.js on Windows first."
  }

  Write-Info "capacitor cli missing in windows mirror; running npm install"
  & $npmCmd.Source install
  if ($LASTEXITCODE -ne 0) {
    throw "npm install failed in Windows mirror; cannot run Capacitor sync."
  }
}

function Sync-WindowsMirrorDependencies {
  $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($null -eq $npmCmd) {
    throw "npm.cmd not found on Windows. Install Node.js on Windows first."
  }

  $nodeModulesDir = Join-Path $WindowsWorkDir "node_modules"
  $installStampPath = Join-Path $nodeModulesDir ".foliole-install-stamp"
  $packageJsonPath = Join-Path $WindowsWorkDir "package.json"
  $packageLockPath = Join-Path $WindowsWorkDir "package-lock.json"
  if ($DependencyRefresh -eq "skip" -and (Test-Path -Path $nodeModulesDir)) {
    Write-Info "dependency refresh skipped by ANDROID_WINDOWS_DEPENDENCY_REFRESH=skip"
    return
  }

  $needsInstall = !(Test-Path -Path $nodeModulesDir) -or !(Test-Path -Path $installStampPath)
  if ($DependencyRefresh -eq "force") {
    $needsInstall = $true
  }

  if (!$needsInstall -and (Test-Path -Path $packageLockPath)) {
    $needsInstall = (Get-Item $packageLockPath).LastWriteTimeUtc -gt (Get-Item $installStampPath).LastWriteTimeUtc
  }

  if (!$needsInstall -and !(Test-Path -Path $packageLockPath) -and (Test-Path -Path $packageJsonPath)) {
    $needsInstall = (Get-Item $packageJsonPath).LastWriteTimeUtc -gt (Get-Item $installStampPath).LastWriteTimeUtc
  }

  if (!$needsInstall) {
    return
  }

  Write-Info "package manifest changed in windows mirror; running npm install"
  & $npmCmd.Source install
  if ($LASTEXITCODE -ne 0) {
    throw "npm install failed in Windows mirror; cannot refresh dependencies for Capacitor sync."
  }

  if (!(Test-Path -Path $nodeModulesDir)) {
    throw "node_modules missing after npm install in Windows mirror."
  }

  Set-Content -Path $installStampPath -Value (Get-Date).ToUniversalTime().ToString("o") -NoNewline
}

Push-Location $WindowsWorkDir
try {
  Write-Info "workdir: $WindowsWorkDir"
  Ensure-CapacitorCliAvailable
  Sync-WindowsMirrorDependencies
  $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($null -eq $npmCmd) {
    throw "npm.cmd not found on Windows. Install Node.js on Windows first."
  }
  $inputHash = Get-CapSyncInputHash
  if (Test-CapSyncCacheHit -InputHash $inputHash) {
    Write-Info "cache: HIT input=$inputHash"
    Write-Info "status: SYNCED"
    return
  }
  Write-Info "cache: MISS input=$inputHash"
  Write-Info "building companion web entry"
  & $npmCmd.Source run $AndroidWebBuildScript
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
  $npxCmd = Get-Command npx.cmd -ErrorAction SilentlyContinue
  if ($null -eq $npxCmd) {
    throw "npx.cmd not found on Windows. Install Node.js on Windows first."
  }
  & $npxCmd.Source cap sync android
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
  Write-CapSyncCache -InputHash $inputHash
  Write-Info "status: SYNCED"
} finally {
  Pop-Location
}
