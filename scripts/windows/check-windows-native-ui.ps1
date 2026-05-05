param(
  [Parameter(Mandatory = $true)]
  [string]$WindowsWorkDir,
  [Parameter(Mandatory = $true)]
  [string]$LogDir,
  [switch]$ForceScreenshot,
  [double]$MinNonBlackRatio = 0.03,
  [double]$MinLumaStdDev = 8.0,
  [double]$MinTopBandStdDev = 12.0,
  [int]$KeepLatestScreenshots = 3
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class NativeWindowApi {
  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")]
  public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }
}
"@

function Get-AppProcess {
  param([string]$WorkDir)

  $exePathLower = (Join-Path $WorkDir "src-tauri\target\debug\foliole-tauri-core.exe").ToLowerInvariant()
  return Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq "foliole-tauri-core.exe" -and
    $_.ExecutablePath -and
    $_.ExecutablePath.ToLowerInvariant() -eq $exePathLower
  } | Select-Object -First 1
}

function Capture-WindowPng {
  param(
    [IntPtr]$WindowHandle,
    [string]$OutputPath
  )

  $rect = New-Object NativeWindowApi+RECT
  if (-not [NativeWindowApi]::GetWindowRect($WindowHandle, [ref]$rect)) {
    throw "GetWindowRect failed."
  }

  $width = [Math]::Max(1, $rect.Right - $rect.Left)
  $height = [Math]::Max(1, $rect.Bottom - $rect.Top)
  if ($width -lt 200 -or $height -lt 120) {
    throw "Window size too small for UI check: ${width}x${height}."
  }

  $bitmap = New-Object System.Drawing.Bitmap $width, $height
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $captureMode = "copy-from-screen"
  try {
    $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size)

    if (Test-Path $OutputPath) {
      Remove-Item -Force $OutputPath
    }
    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }

  return @{
    left = $rect.Left
    top = $rect.Top
    width = $width
    height = $height
    capture_mode = $captureMode
  }
}

function Measure-NonBlackRatio {
  param([string]$ImagePath)

  $bitmap = New-Object System.Drawing.Bitmap $ImagePath
  try {
    $stepX = [Math]::Max(1, [Math]::Floor($bitmap.Width / 200))
    $stepY = [Math]::Max(1, [Math]::Floor($bitmap.Height / 120))
    $total = 0
    $nonBlack = 0
    $lumaSum = 0.0
    $lumaSquareSum = 0.0
    $topBandCount = 0
    $topBandSum = 0.0
    $topBandSquareSum = 0.0

    $bandStartY = [Math]::Max(24, [Math]::Floor($bitmap.Height * 0.05))
    $bandHeight = [Math]::Max(120, [Math]::Floor($bitmap.Height * 0.2))
    $bandEndY = [Math]::Min($bitmap.Height - 1, $bandStartY + $bandHeight)
    $marginX = [Math]::Max(18, [Math]::Floor($bitmap.Width * 0.08))

    for ($y = 0; $y -lt $bitmap.Height; $y += $stepY) {
      for ($x = 0; $x -lt $bitmap.Width; $x += $stepX) {
        $pixel = $bitmap.GetPixel($x, $y)
        $total += 1
        $luma = (0.2126 * $pixel.R) + (0.7152 * $pixel.G) + (0.0722 * $pixel.B)
        $lumaSum += $luma
        $lumaSquareSum += ($luma * $luma)
        if (($pixel.R + $pixel.G + $pixel.B) -gt 36) {
          $nonBlack += 1
        }
        if ($y -ge $bandStartY -and $y -lt $bandEndY -and $x -ge $marginX -and $x -lt ($bitmap.Width - $marginX)) {
          $topBandCount += 1
          $topBandSum += $luma
          $topBandSquareSum += ($luma * $luma)
        }
      }
    }

    if ($total -eq 0) {
      return @{
        nonBlackRatio = 0.0
        lumaStdDev = 0.0
      }
    }

    $mean = $lumaSum / $total
    $variance = ($lumaSquareSum / $total) - ($mean * $mean)
    if ($variance -lt 0) {
      $variance = 0
    }

    $topBandStdDev = 0.0
    if ($topBandCount -gt 0) {
      $topBandMean = $topBandSum / $topBandCount
      $topBandVariance = ($topBandSquareSum / $topBandCount) - ($topBandMean * $topBandMean)
      if ($topBandVariance -lt 0) {
        $topBandVariance = 0
      }
      $topBandStdDev = [Math]::Sqrt($topBandVariance)
    }

    return @{
      nonBlackRatio = [Math]::Round(($nonBlack / $total), 4)
      lumaStdDev = [Math]::Round([Math]::Sqrt($variance), 4)
      topBandStdDev = [Math]::Round($topBandStdDev, 4)
    }
  } finally {
    $bitmap.Dispose()
  }
}

function Prune-OldScreenshots {
  param(
    [string]$Directory,
    [int]$KeepCount
  )

  if ($KeepCount -lt 1) {
    $KeepCount = 1
  }

  $shots = Get-ChildItem -Path $Directory -Filter "windows-native-ui-*.png" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending

  if (-not $shots) {
    return
  }

  $toDelete = $shots | Select-Object -Skip $KeepCount
  foreach ($item in $toDelete) {
    Remove-Item -Force $item.FullName -ErrorAction SilentlyContinue
  }
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Prune-OldScreenshots -Directory $LogDir -KeepCount $KeepLatestScreenshots
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputImage = Join-Path $LogDir "windows-native-ui-$timestamp.png"
$readyMarkerPath = Join-Path $WindowsWorkDir ".windows-native-boot-ready.json"

$appProcess = Get-AppProcess -WorkDir $WindowsWorkDir
if (-not $appProcess) {
  Write-Output "[windows-ui-check] app process not found."
  exit 2
}

$managed = Get-Process -Id $appProcess.ProcessId -ErrorAction SilentlyContinue
if (-not $managed -or $managed.MainWindowHandle -eq 0) {
  Write-Output "[windows-ui-check] app main window handle missing."
  exit 3
}

if (-not $ForceScreenshot -and (Test-Path $readyMarkerPath)) {
  try {
    $readyMarker = Get-Content -Path $readyMarkerPath -Raw | ConvertFrom-Json
    $markerSession = "$($readyMarker.session)".Trim()
    $markerStage = "$($readyMarker.stage)".Trim()
    $markerPid = [int]$readyMarker.pid
    if ($markerStage -eq "app_ready" -and $markerSession.Length -gt 0 -and $markerPid -eq $managed.Id) {
      Write-Output "[windows-ui-check] ready marker path: $readyMarkerPath"
      Write-Output "[windows-ui-check] ready marker stage=app_ready session=$markerSession pid=$markerPid"
      Write-Output "[windows-ui-check] passed via startup handshake."
      exit 0
    }
  } catch {
    Write-Output "[windows-ui-check] ready marker parse failed: $($_.Exception.Message)"
  }
}

$windowHandle = [IntPtr]$managed.MainWindowHandle
if ([NativeWindowApi]::IsIconic($windowHandle)) {
  [void][NativeWindowApi]::ShowWindowAsync($windowHandle, 9)
  Start-Sleep -Milliseconds 200
}

$HWND_TOPMOST = [IntPtr](-1)
$HWND_NOTOPMOST = [IntPtr](-2)
$SWP_NOMOVE = 0x0002
$SWP_NOSIZE = 0x0001
$SWP_SHOWWINDOW = 0x0040
[void][NativeWindowApi]::SetWindowPos($windowHandle, $HWND_TOPMOST, 0, 0, 0, 0, $SWP_NOMOVE -bor $SWP_NOSIZE -bor $SWP_SHOWWINDOW)
[void][NativeWindowApi]::SetWindowPos($windowHandle, $HWND_NOTOPMOST, 0, 0, 0, 0, $SWP_NOMOVE -bor $SWP_NOSIZE -bor $SWP_SHOWWINDOW)

$foregroundPid = 0
for ($attempt = 1; $attempt -le 20; $attempt++) {
  [void][NativeWindowApi]::SetForegroundWindow($windowHandle)
  Start-Sleep -Milliseconds 120
  $foregroundHandle = [NativeWindowApi]::GetForegroundWindow()
  [uint32]$currentForegroundPid = 0
  [void][NativeWindowApi]::GetWindowThreadProcessId($foregroundHandle, [ref]$currentForegroundPid)
  $foregroundPid = [int]$currentForegroundPid
  if ($foregroundPid -eq $managed.Id) {
    break
  }
}

if ($foregroundPid -ne $managed.Id) {
  Write-Output "[windows-ui-check] failed: app window is not foreground, pid=$foregroundPid"
  exit 5
}

$rectInfo = Capture-WindowPng -WindowHandle $windowHandle -OutputPath $outputImage
$visualStats = Measure-NonBlackRatio -ImagePath $outputImage
$nonBlackRatio = $visualStats.nonBlackRatio
$lumaStdDev = $visualStats.lumaStdDev
$topBandStdDev = $visualStats.topBandStdDev
Prune-OldScreenshots -Directory $LogDir -KeepCount $KeepLatestScreenshots

Write-Output "[windows-ui-check] screenshot: $outputImage"
Write-Output "[windows-ui-check] rect: left=$($rectInfo.left), top=$($rectInfo.top), width=$($rectInfo.width), height=$($rectInfo.height)"
Write-Output "[windows-ui-check] capture_mode=$($rectInfo.capture_mode)"
Write-Output "[windows-ui-check] app_pid=$($managed.Id), foreground_pid=$foregroundPid"
Write-Output "[windows-ui-check] non_black_ratio=$nonBlackRatio"
Write-Output "[windows-ui-check] luma_std_dev=$lumaStdDev"
Write-Output "[windows-ui-check] top_band_std_dev=$topBandStdDev"

if ($nonBlackRatio -lt $MinNonBlackRatio) {
  Write-Output "[windows-ui-check] failed: ratio below threshold $MinNonBlackRatio"
  exit 4
}

if ($lumaStdDev -lt $MinLumaStdDev) {
  Write-Output "[windows-ui-check] failed: luma std-dev below threshold $MinLumaStdDev"
  exit 6
}

if ($topBandStdDev -lt $MinTopBandStdDev) {
  Write-Output "[windows-ui-check] failed: top-band std-dev below threshold $MinTopBandStdDev"
  exit 7
}

Write-Output "[windows-ui-check] passed."
