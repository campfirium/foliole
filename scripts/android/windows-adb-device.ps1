function Resolve-AndroidDeviceSerialFromAdbDevices {
  param(
    [object[]]$DeviceLines,
    [string]$TargetSerial = ""
  )

  foreach ($line in $DeviceLines) {
    $trimmed = "$line".Trim()
    if ([string]::IsNullOrWhiteSpace($trimmed)) {
      continue
    }

    $parts = $trimmed -split "\s+"
    if ($parts.Count -lt 2) {
      continue
    }
    if (![string]::IsNullOrWhiteSpace($TargetSerial) -and $parts[0] -ne $TargetSerial) {
      continue
    }
    if ($parts[1] -eq "device") {
      return $parts[0]
    }
    if (![string]::IsNullOrWhiteSpace($TargetSerial)) {
      throw "Android device ${TargetSerial} is $($parts[1]). Unlock the device and allow USB debugging."
    }
  }

  return $null
}
