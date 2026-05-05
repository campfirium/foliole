param(
  [Parameter(Mandatory = $true)]
  [string]$WindowsWorkDir,
  [Parameter(Mandatory = $true)]
  [string]$LogDir,
  [double]$MinNonBlackRatio = 0.03
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

    for ($y = 0; $y -lt $bitmap.Height; $y += $stepY) {
      for ($x = 0; $x -lt $bitmap.Width; $x += $stepX) {
        $pixel = $bitmap.GetPixel($x, $y)
        $total += 1
        if (($pixel.R + $pixel.G + $pixel.B) -gt 36) {
          $nonBlack += 1
        }
      }
    }

    if ($total -eq 0) {
      return 0.0
    }

    return [Math]::Round(($nonBlack / $total), 4)
  } finally {
    $bitmap.Dispose()
  }
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputImage = Join-Path $LogDir "windows-native-ui-$timestamp.png"

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
$nonBlackRatio = Measure-NonBlackRatio -ImagePath $outputImage

Write-Output "[windows-ui-check] screenshot: $outputImage"
Write-Output "[windows-ui-check] rect: left=$($rectInfo.left), top=$($rectInfo.top), width=$($rectInfo.width), height=$($rectInfo.height)"
Write-Output "[windows-ui-check] capture_mode=$($rectInfo.capture_mode)"
Write-Output "[windows-ui-check] app_pid=$($managed.Id), foreground_pid=$foregroundPid"
Write-Output "[windows-ui-check] non_black_ratio=$nonBlackRatio"

if ($nonBlackRatio -lt $MinNonBlackRatio) {
  Write-Output "[windows-ui-check] failed: ratio below threshold $MinNonBlackRatio"
  exit 4
}

Write-Output "[windows-ui-check] passed."
