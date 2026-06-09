import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const POWERSHELL_SELECTION_COMMAND = [
  'Add-Type -AssemblyName UIAutomationClient;',
  '$focused = [System.Windows.Automation.AutomationElement]::FocusedElement;',
  'if ($null -eq $focused) { "unknown"; exit 0; }',
  '$pattern = $null;',
  '$ok = $focused.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$pattern);',
  'if (-not $ok) { "unknown"; exit 0; }',
  '$selection = $pattern.GetSelection();',
  'foreach ($range in $selection) {',
  '  if (-not [string]::IsNullOrEmpty($range.GetText(1024))) { "true"; exit 0; }',
  '}',
  '"false";'
].join(' ');

export async function detectWindowsTextSelection(): Promise<boolean | null> {
  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      POWERSHELL_SELECTION_COMMAND
    ], { timeout: 1200 });
    return parseSelectionProbe(stdout);
  } catch {
    return null;
  }
}

function parseSelectionProbe(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return null;
}
