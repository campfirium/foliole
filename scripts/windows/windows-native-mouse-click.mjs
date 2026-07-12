import { spawnSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';

const SCRIPT_PATH = fileURLToPath(new URL('./windows-native-mouse-click.ps1', import.meta.url));

function validateClickInput(input) {
  if (!/^[0-9a-f]{16}$/iu.test(input.hwndHex)) throw new Error('invalid native window handle');
  for (const [name, value] of [['x', input.x], ['y', input.y]]) {
    if (!Number.isSafeInteger(value) || value < -32_768 || value > 131_072) {
      throw new Error(`invalid native mouse ${name}`);
    }
  }
}

export function clickWindowsScreenPoint(input, run = spawnSync) {
  validateClickInput(input);
  const result = run('powershell.exe', [
    '-NoProfile',
    '-File', SCRIPT_PATH,
    '-HwndHex', input.hwndHex,
    '-X', String(input.x),
    '-Y', String(input.y)
  ], { encoding: 'utf8' });
  if (result.status !== 0) {
    const error = new Error(`native mouse adapter blocked: ${result.stderr || result.stdout || 'unknown error'}`);
    error.code = 'native_mouse_adapter_blocked';
    throw error;
  }
}
