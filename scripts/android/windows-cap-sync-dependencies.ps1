function Ensure-CapacitorCliAvailable {
  $cliPackageJson = Join-Path $WindowsWorkDir "node_modules\$($CapCliPackage -replace '/', '\')\package.json"
  if (Test-Path -Path $cliPackageJson) { return }
  $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($null -eq $npmCmd) { throw "npm.cmd not found on Windows. Install Node.js on Windows first." }
  Write-Info "capacitor cli missing in windows mirror; running npm install"
  Invoke-CmdTool -CommandPath $npmCmd.Source -Arguments @("install") -FailureMessage "npm install failed in Windows mirror; cannot run Capacitor sync."
}

function Sync-WindowsMirrorDependencies {
  $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($null -eq $npmCmd) { throw "npm.cmd not found on Windows. Install Node.js on Windows first." }
  $nodeModulesDir = Join-Path $WindowsWorkDir "node_modules"
  $installStampPath = Join-Path $nodeModulesDir ".foliole-install-stamp"
  $packageJsonPath = Join-Path $WindowsWorkDir "package.json"
  $packageLockPath = Join-Path $WindowsWorkDir "package-lock.json"
  if ($DependencyRefresh -eq "ci") {
    if (!(Test-Path -Path $packageLockPath -PathType Leaf)) { throw "package-lock.json is required for dependency refresh mode ci." }
    Write-Info "running lockfile-strict npm ci in windows mirror"
    Invoke-CmdTool -CommandPath $npmCmd.Source -Arguments @("ci") -FailureMessage "npm ci failed in Windows mirror; cannot refresh lab dependencies."
    Set-Content -Path $installStampPath -Value (Get-Date).ToUniversalTime().ToString("o") -NoNewline
    return
  }
  if ($DependencyRefresh -eq "skip" -and (Test-Path -Path $nodeModulesDir)) {
    Write-Info "dependency refresh skipped by ANDROID_WINDOWS_DEPENDENCY_REFRESH=skip"
    return
  }
  $needsInstall = !(Test-Path -Path $nodeModulesDir) -or !(Test-Path -Path $installStampPath)
  if ($DependencyRefresh -eq "force") { $needsInstall = $true }
  if (!$needsInstall -and (Test-Path -Path $packageLockPath)) {
    $needsInstall = (Get-Item $packageLockPath).LastWriteTimeUtc -gt (Get-Item $installStampPath).LastWriteTimeUtc
  }
  if (!$needsInstall -and !(Test-Path -Path $packageLockPath) -and (Test-Path -Path $packageJsonPath)) {
    $needsInstall = (Get-Item $packageJsonPath).LastWriteTimeUtc -gt (Get-Item $installStampPath).LastWriteTimeUtc
  }
  if (!$needsInstall) { return }
  Write-Info "package manifest changed in windows mirror; running npm install"
  Invoke-CmdTool -CommandPath $npmCmd.Source -Arguments @("install") -FailureMessage "npm install failed in Windows mirror; cannot refresh dependencies for Capacitor sync."
  if (!(Test-Path -Path $nodeModulesDir)) { throw "node_modules missing after npm install in Windows mirror." }
  Set-Content -Path $installStampPath -Value (Get-Date).ToUniversalTime().ToString("o") -NoNewline
}
