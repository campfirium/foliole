param(
  [string]$WindowsWorkDir = "C:\dev\foliole-android-preview",
  [string]$AndroidHostDir = "android",
  [string]$CapCliPackage = "@capacitor/cli",
  [ValidateSet("auto", "skip", "force")]
  [string]$DependencyRefresh = "auto"
)

$ErrorActionPreference = "Stop"

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
  return $files | Where-Object { Test-CapSyncInputFile -File $_ } | Sort-Object FullName
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
  Invoke-CmdTool -CommandPath $npmCmd.Source -Arguments @("install") -FailureMessage "npm install failed in Windows mirror; cannot run Capacitor sync."
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
  Invoke-CmdTool -CommandPath $npmCmd.Source -Arguments @("install") -FailureMessage "npm install failed in Windows mirror; cannot refresh dependencies for Capacitor sync."

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
  Invoke-NodeTool -Arguments @("scripts\android\generate-companion-schema.mjs") -FailureMessage "Android companion schema generation failed."
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
