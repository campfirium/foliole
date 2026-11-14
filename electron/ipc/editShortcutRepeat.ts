import type { Input } from 'electron';

function matchesAccelerator(input: Input, accelerator: string) {
  const parts = accelerator.toLowerCase().split('+');
  const key = parts.pop();
  const shortcutKey = input.key === ' ' ? 'space' : input.key.replace(/^Arrow/, '').toLowerCase();
  return key === shortcutKey &&
    input.meta === parts.includes('command') &&
    input.control === parts.includes('control') &&
    input.alt === parts.includes('alt') &&
    input.shift === parts.includes('shift');
}

export function shouldSuppressEditShortcutRepeat(input: Input, historyAccelerators: readonly (string | null | undefined)[], platform = process.platform) {
  if (input.type !== 'keyDown' || !input.isAutoRepeat || input.isComposing) return false;
  const hasStandardModifier = platform === 'darwin' ? input.meta && !input.control : input.control && !input.meta;
  const key = input.key.toLowerCase();
  // Chromium can handle standard editing shortcuts even without an application menu accelerator.
  const isStandardEditShortcut = hasStandardModifier && !input.alt && (
    key === 'z' || (!input.shift && (key === 'x' || (platform !== 'darwin' && key === 'y')))
  );
  return isStandardEditShortcut || historyAccelerators.some(
    accelerator => Boolean(accelerator && matchesAccelerator(input, accelerator))
  );
}
