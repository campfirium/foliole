param(
  [Parameter(Mandatory = $true)][string]$RepoRoot
)

$ErrorActionPreference = "Stop"
$canonicalRepo = [System.IO.Path]::GetFullPath($RepoRoot).TrimEnd('\')
$processNames = @("cmd.exe", "java.exe", "javaw.exe")
$matches = @(
  Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -in $processNames -and
      $_.CommandLine -and
      $_.CommandLine.IndexOf($canonicalRepo, [StringComparison]::OrdinalIgnoreCase) -ge 0
    } |
    Select-Object Name, ProcessId, ParentProcessId, SessionId, CommandLine
)
ConvertTo-Json -InputObject $matches -Depth 4 -Compress
