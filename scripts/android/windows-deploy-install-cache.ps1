function Get-InstallCachePath {
  param([string]$WindowsWorkDir)
  $cacheDir = Join-Path $WindowsWorkDir ".lab\internal\runtime"
  New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null
  return Join-Path $cacheDir "android-install-cache.json"
}

function Get-ApkHash {
  param([string]$AndroidDir)
  $apkPath = Join-Path $AndroidDir "app\build\outputs\apk\debug\app-debug.apk"
  if (!(Test-Path -Path $apkPath)) {
    return ""
  }
  return (Get-FileHash -Algorithm SHA256 -Path $apkPath).Hash.ToLowerInvariant()
}

function Get-WebAssetsHash {
  param([string]$AndroidDir)
  $assetDir = Join-Path $AndroidDir "app\src\main\assets\public"
  if (!(Test-Path -Path $assetDir)) {
    return ""
  }
  $basePath = [System.IO.Path]::GetFullPath($assetDir).TrimEnd('\') + '\'
  $lines = Get-ChildItem -Path $assetDir -File -Recurse |
    Sort-Object FullName |
    ForEach-Object {
      $relativePath = [System.IO.Path]::GetFullPath($_.FullName).Substring($basePath.Length).Replace('\', '/')
      $hash = (Get-FileHash -Algorithm SHA256 -Path $_.FullName).Hash.ToLowerInvariant()
      "$relativePath=$hash"
    }
  $bytes = [System.Text.Encoding]::UTF8.GetBytes(($lines -join "`n"))
  $sha = [System.Security.Cryptography.SHA256]::Create()
  return ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
}

function Test-InstallCacheHit {
  param(
    [string]$ApkHash,
    [string]$Serial,
    [string]$VersionCode,
    [string]$WebAssetsHash,
    [string]$WindowsWorkDir
  )
  $cachePath = Get-InstallCachePath -WindowsWorkDir $WindowsWorkDir
  if ([string]::IsNullOrWhiteSpace($ApkHash) -or [string]::IsNullOrWhiteSpace($WebAssetsHash) -or !(Test-Path -Path $cachePath)) {
    return $false
  }
  $cache = Get-Content -Path $cachePath -Raw | ConvertFrom-Json
  return $cache.apkHash -eq $ApkHash -and $cache.serial -eq $Serial -and $cache.versionCode -eq $VersionCode -and $cache.webAssetsHash -eq $WebAssetsHash -and $cache.status -eq "ok" -and $cache.version -eq 2
}

function Write-InstallCache {
  param(
    [string]$ApkHash,
    [string]$Serial,
    [string]$VersionCode,
    [string]$WebAssetsHash,
    [string]$WindowsWorkDir
  )
  $payload = @{ apkHash = $ApkHash; serial = $Serial; status = "ok"; timestamp = (Get-Date).ToUniversalTime().ToString("o"); version = 2; versionCode = $VersionCode; webAssetsHash = $WebAssetsHash }
  $payload | ConvertTo-Json | Set-Content -Path (Get-InstallCachePath -WindowsWorkDir $WindowsWorkDir) -Encoding UTF8
}
