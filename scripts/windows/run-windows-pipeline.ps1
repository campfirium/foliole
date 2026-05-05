param(
  [Parameter(Mandatory = $true)]
  [string]$Distro,
  [Parameter(Mandatory = $true)]
  [string]$SourceRepoLinuxPath,
  [Parameter(Mandatory = $true)]
  [string]$SourceRepoWindowsPath,
  [Parameter(Mandatory = $true)]
  [string]$WindowsWorkDir,
  [Parameter(Mandatory = $true)]
  [string]$LogDir,
  [switch]$SkipTauriBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Set-Location -Path $env:SystemRoot

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$logPath = Join-Path $LogDir "windows-pipeline-$timestamp.log"

function Write-Log {
  param([string]$Message)
  $Message | Tee-Object -FilePath $logPath -Append
}

function Invoke-External {
  param(
    [string]$Step,
    [string]$Command
  )

  Write-Log ""
  Write-Log "[windows-pipeline] step: $Step"
  Write-Log "[windows-pipeline] cmd: $Command"
  $previousErrorPreference = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"
  try {
    cmd.exe /d /c "$Command" 2>&1 | Tee-Object -FilePath $logPath -Append | Out-Host
    $exit = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorPreference
  }
  if ($exit -ne 0) {
    Write-Log "[windows-pipeline] step failed ($Step), exit=$exit"
    exit $exit
  }
}

function Invoke-Robocopy {
  param(
    [string]$SourcePath,
    [string]$TargetPath
  )

  $excludeDirs = @(
    ".git",
    ".lab",
    "ref",
    "node_modules",
    "dist",
    "coverage",
    "playwright-report",
    "test-results",
    "blob-report",
    "target",
    "gen",
    "logs"
  )

  $excludeFiles = @("*.log", "*.tmp")
  $dirArgs = ($excludeDirs | ForEach-Object { "/XD `"$($_)`"" }) -join " "
  $fileArgs = ($excludeFiles | ForEach-Object { "/XF `"$($_)`"" }) -join " "

  $syncCommand = "robocopy `"$SourcePath`" `"$TargetPath`" /MIR /R:2 /W:1 /NFL /NDL /NP /XJ $dirArgs $fileArgs"

  Write-Log ""
  Write-Log "[windows-pipeline] step: sync source to windows mirror"
  Write-Log "[windows-pipeline] cmd: $syncCommand"
  $previousErrorPreference = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"
  try {
    cmd.exe /d /c "$syncCommand" 2>&1 | Tee-Object -FilePath $logPath -Append | Out-Host
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorPreference
  }
  if ($code -ge 8) {
    Write-Log "[windows-pipeline] sync failed, robocopy exit=$code"
    exit $code
  }

  Write-Log "[windows-pipeline] sync done, robocopy exit=$code"
}

function Get-PackageManager {
  param([string]$WorkDir)

  if ((Test-Path (Join-Path $WorkDir "pnpm-lock.yaml")) -and (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    return "pnpm"
  }

  $hasBunLock = (Test-Path (Join-Path $WorkDir "bun.lockb")) -or (Test-Path (Join-Path $WorkDir "bun.lock"))
  if ($hasBunLock -and (Get-Command bun -ErrorAction SilentlyContinue)) {
    return "bun"
  }

  if ((Test-Path (Join-Path $WorkDir "yarn.lock")) -and (Get-Command yarn -ErrorAction SilentlyContinue)) {
    return "yarn"
  }

  if (Get-Command npm -ErrorAction SilentlyContinue) {
    return "npm"
  }

  Write-Log "[windows-pipeline] npm not found on Windows PATH."
  exit 1
}

function Ensure-Dependencies {
  param(
    [string]$Pm,
    [string]$WorkDir
  )

  if (Test-Path (Join-Path $WorkDir "node_modules")) {
    Write-Log "[windows-pipeline] node_modules exists, skip install."
    return
  }

  switch ($Pm) {
    "pnpm" {
      Invoke-External -Step "install dependencies" -Command "cd /d `"$WorkDir`" && pnpm install --frozen-lockfile"
    }
    "bun" {
      Invoke-External -Step "install dependencies" -Command "cd /d `"$WorkDir`" && bun install --frozen-lockfile"
    }
    "yarn" {
      Invoke-External -Step "install dependencies" -Command "cd /d `"$WorkDir`" && yarn install --frozen-lockfile"
    }
    default {
      $lockPath = Join-Path $WorkDir "package-lock.json"
      if (Test-Path $lockPath) {
        Invoke-External -Step "install dependencies" -Command "cd /d `"$WorkDir`" && npm ci --no-audit --no-fund"
      } else {
        Invoke-External -Step "install dependencies" -Command "cd /d `"$WorkDir`" && npm install --no-audit --no-fund"
      }
    }
  }
}

function Run-QualityGate {
  param(
    [string]$Pm,
    [string]$WorkDir
  )

  switch ($Pm) {
    "pnpm" {
      Invoke-External -Step "lint" -Command "cd /d `"$WorkDir`" && pnpm run lint"
      Invoke-External -Step "typecheck" -Command "cd /d `"$WorkDir`" && pnpm run typecheck"
      Invoke-External -Step "test" -Command "cd /d `"$WorkDir`" && pnpm run test"
      Invoke-External -Step "build" -Command "cd /d `"$WorkDir`" && pnpm run build"
    }
    "bun" {
      Invoke-External -Step "lint" -Command "cd /d `"$WorkDir`" && bun run lint"
      Invoke-External -Step "typecheck" -Command "cd /d `"$WorkDir`" && bun run typecheck"
      Invoke-External -Step "test" -Command "cd /d `"$WorkDir`" && bun run test"
      Invoke-External -Step "build" -Command "cd /d `"$WorkDir`" && bun run build"
    }
    "yarn" {
      Invoke-External -Step "lint" -Command "cd /d `"$WorkDir`" && yarn lint"
      Invoke-External -Step "typecheck" -Command "cd /d `"$WorkDir`" && yarn typecheck"
      Invoke-External -Step "test" -Command "cd /d `"$WorkDir`" && yarn test"
      Invoke-External -Step "build" -Command "cd /d `"$WorkDir`" && yarn build"
    }
    default {
      Invoke-External -Step "lint" -Command "cd /d `"$WorkDir`" && npm run lint"
      Invoke-External -Step "typecheck" -Command "cd /d `"$WorkDir`" && npm run typecheck"
      Invoke-External -Step "test" -Command "cd /d `"$WorkDir`" && npm run test"
      Invoke-External -Step "build" -Command "cd /d `"$WorkDir`" && npm run build"
    }
  }
}

function Run-TauriBuild {
  param(
    [string]$Pm,
    [string]$WorkDir
  )

  if ($SkipTauriBuild.IsPresent) {
    Write-Log "[windows-pipeline] SkipTauriBuild enabled, skip tauri build."
    return
  }

  switch ($Pm) {
    "yarn" {
      Invoke-External -Step "tauri build debug" -Command "cd /d `"$WorkDir`" && yarn tauri:build --debug"
    }
    "pnpm" {
      Invoke-External -Step "tauri build debug" -Command "cd /d `"$WorkDir`" && pnpm run tauri:build -- --debug"
    }
    "bun" {
      Invoke-External -Step "tauri build debug" -Command "cd /d `"$WorkDir`" && bun run tauri:build -- --debug"
    }
    default {
      Invoke-External -Step "tauri build debug" -Command "cd /d `"$WorkDir`" && npm run tauri:build -- --debug"
    }
  }
}

$sourceSuffix = $SourceRepoLinuxPath.TrimStart("/").Replace("/", "\")
$sourcePath = "\\wsl.localhost\$Distro\$sourceSuffix"

Write-Log "[windows-pipeline] started at $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")"
Write-Log "[windows-pipeline] source (linux): $SourceRepoLinuxPath"
Write-Log "[windows-pipeline] source (windows path hint): $SourceRepoWindowsPath"
Write-Log "[windows-pipeline] source (unc): $sourcePath"
Write-Log "[windows-pipeline] target (windows): $WindowsWorkDir"

if (-not (Test-Path $sourcePath)) {
  Write-Log "[windows-pipeline] source path does not exist: $sourcePath"
  exit 1
}

New-Item -ItemType Directory -Force -Path $WindowsWorkDir | Out-Null
Invoke-Robocopy -SourcePath $sourcePath -TargetPath $WindowsWorkDir

$packageJsonPath = Join-Path $WindowsWorkDir "package.json"
if (-not (Test-Path $packageJsonPath)) {
  Write-Log "[windows-pipeline] package.json not found after sync: $packageJsonPath"
  exit 1
}

$pm = Get-PackageManager -WorkDir $WindowsWorkDir
Write-Log "[windows-pipeline] detected package manager: $pm"

Ensure-Dependencies -Pm $pm -WorkDir $WindowsWorkDir
Run-QualityGate -Pm $pm -WorkDir $WindowsWorkDir
Run-TauriBuild -Pm $pm -WorkDir $WindowsWorkDir

Write-Log ""
Write-Log "[windows-pipeline] status: PASS"
Write-Log "[windows-pipeline] log file: $logPath"
exit 0
