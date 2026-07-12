param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9A-Fa-f]{16}$')]
  [string]$HwndHex,
  [Parameter(Mandatory = $true)]
  [ValidateRange(-32768, 131072)]
  [int]$X,
  [Parameter(Mandatory = $true)]
  [ValidateRange(-32768, 131072)]
  [int]$Y
)

$ErrorActionPreference = 'Stop'

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class FolioleValidationMouse {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, int Msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
}
"@

$bytes = for ($index = 0; $index -lt $HwndHex.Length; $index += 2) {
  [Convert]::ToByte($HwndHex.Substring($index, 2), 16)
}
$hwnd = [IntPtr]([BitConverter]::ToInt64([byte[]]$bytes, 0))
[FolioleValidationMouse]::SetForegroundWindow($hwnd) | Out-Null
Start-Sleep -Milliseconds 120
[FolioleValidationMouse]::SetCursorPos($X, $Y) | Out-Null
Start-Sleep -Milliseconds 80
[FolioleValidationMouse]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 80
[FolioleValidationMouse]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
[FolioleValidationMouse]::SendMessage($hwnd, 0x0202, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
