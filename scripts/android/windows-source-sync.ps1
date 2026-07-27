param(
  [string]$SourceDir,
  [string]$WindowsWorkDir = "C:\dev\foliole-android-preview"
)

$ErrorActionPreference = "Stop"

function Write-Info {
  param([string]$Message)
  Write-Host "[android-source-sync] $Message"
}

function Assert-Directory {
  param(
    [string]$Path,
    [string]$Label
  )

  if ([string]::IsNullOrWhiteSpace($Path)) {
    throw "$Label is required."
  }
  if (!(Test-Path -LiteralPath $Path -PathType Container)) {
    throw "$Label does not exist: $Path"
  }
}

function Invoke-RobocopySync {
  param(
    [string]$Source,
    [string]$Destination
  )

  $robocopyPath = Join-Path $env:SystemRoot "System32\robocopy.exe"
  if (!(Test-Path -LiteralPath $robocopyPath)) {
    $robocopyCommand = Get-Command robocopy.exe -ErrorAction SilentlyContinue
    if ($null -eq $robocopyCommand) {
      throw "robocopy.exe not found."
    }
    $robocopyPath = $robocopyCommand.Source
  }
  $excludeDirs = @(
    ".claude",
    ".agents",
    ".codex",
    ".git",
    ".githooks",
    ".github",
    ".lab",
    ".tmp",
    ".tmp-*",
    ".tmp-vitest",
    ".tmp-vitest-*",
    ".tmp-npm",
    "ref",
    "trees",
    "src-tauri",
    "node_modules",
    "release",
    "artifacts/windows",
    "coverage",
    "dist",
    "android\.gradle",
    "android\build",
    "android\app\build",
    "android\app\src\main\assets\public",
    "android\capacitor-cordova-android-plugins",
    "playwright-report",
    "test-results",
    "blob-report",
    "logs"
  )
  $excludeFiles = @(
    ".windows-native-boot-ready.json",
    ".windows-native-bridge-ready.json",
    ".windows-native-window-visible.json",
    ".windows-native-client-state.json",
    ".windows-dev-restart-intent.json",
    ".windows-dev-restart-delivered.json",
    ".windows-dev-renderer-reload-intent.json",
    ".windows-dev-renderer-reload-delivered.json",
    ".windows-dev-shell-restart-request.json",
    "android\app\src\main\assets\capacitor.config.json",
    "android\app\src\main\assets\capacitor.plugins.json",
    "android\app\src\main\res\xml\config.xml",
    "android\app\capacitor.build.gradle",
    "android\capacitor.settings.gradle"
  )

  $args = @(
    $Source,
    $Destination,
    "*.*",
    "/E",
    "/COPY:DAT",
    "/DCOPY:DAT",
    "/R:1",
    "/W:1",
    "/XJ",
    "/NFL",
    "/NDL",
    "/NJH",
    "/NJS",
    "/NP",
    "/IM",
    "/IS",
    "/IT",
    "/XD"
  ) + $excludeDirs + @("/XF") + $excludeFiles

  & $robocopyPath @args
  $exitCode = $LASTEXITCODE
  if ($null -eq $exitCode) {
    $exitCode = 0
  }
  if ($exitCode -ge 8) {
    throw "robocopy failed with exit code $exitCode."
  }
  Write-Info "status: SYNCED code=$exitCode"
}

function Test-ExcludedRelativePath {
  param(
    [string]$RelativePath,
    [array]$Patterns,
    [bool]$DirectoryMode
  )

  $normalized = $RelativePath.ToLowerInvariant()
  foreach ($pattern in $Patterns) {
    $match = $pattern.ToLowerInvariant()
    if ($match.Contains("*")) {
      if ($normalized -like $match -or ($DirectoryMode -and $normalized -like "$match\*")) {
        return $true
      }
      continue
    }
    if ($normalized -eq $match -or ($DirectoryMode -and $normalized.StartsWith("$match\"))) {
      return $true
    }
  }
  return $false
}

function Copy-ChangedSourceFiles {
  param(
    [string]$Source,
    [string]$Destination
  )

  $sourceRoot = (Resolve-Path -LiteralPath $Source).Path.TrimEnd("\")
  $copied = 0
  Get-ChildItem -LiteralPath $sourceRoot -File -Recurse -Force | ForEach-Object {
    $relative = $_.FullName.Substring($sourceRoot.Length).TrimStart("\")
    if (Test-ExcludedRelativePath -RelativePath $relative -Patterns $excludeFiles -DirectoryMode $false) {
      return
    }
    if (Test-ExcludedRelativePath -RelativePath $relative -Patterns $excludeDirs -DirectoryMode $true) {
      return
    }
    $target = Join-Path $Destination $relative
    $targetItem = Get-Item -LiteralPath $target -ErrorAction SilentlyContinue
    if ($null -ne $targetItem -and $targetItem.Length -eq $_.Length) {
      $sourceHash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
      $targetHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
      if ($sourceHash -eq $targetHash) {
        return
      }
    }
    $targetDir = Split-Path -Parent $target
    if (!(Test-Path -LiteralPath $targetDir -PathType Container)) {
      New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    }
    Copy-Item -LiteralPath $_.FullName -Destination $target -Force
    $copied += 1
  }
  Write-Info "content overlay copied=$copied"
}

Assert-Directory -Path $SourceDir -Label "SourceDir"
if (!(Test-Path -LiteralPath $WindowsWorkDir -PathType Container)) {
  New-Item -ItemType Directory -Path $WindowsWorkDir -Force | Out-Null
}

$sourcePath = (Resolve-Path -LiteralPath $SourceDir).Path
$destinationPath = (Resolve-Path -LiteralPath $WindowsWorkDir).Path
Write-Info "source: $sourcePath"
Write-Info "destination: $destinationPath"
Invoke-RobocopySync -Source $sourcePath -Destination $destinationPath
Copy-ChangedSourceFiles -Source $sourcePath -Destination $destinationPath
