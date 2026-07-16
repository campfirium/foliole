export const GLOBAL_CAPTURE_COMMAND_ID = 'capture.globalToInbox';

export function getDefaultGlobalCaptureAccelerator(platform: NodeJS.Platform) {
  if (platform === 'darwin') return 'Alt+Shift+C';
  if (platform === 'win32') return 'Alt+Shift+C';
  return null;
}

function normalizeAccelerator(label: unknown) {
  if (typeof label !== 'string') return null;
  const tokens = label.split('+').map((token) => token.trim()).filter(Boolean);
  if (tokens.length < 2) return null;
  const normalized = tokens.map((token) => {
    const alias = token.toLowerCase();
    if (alias === 'cmd' || alias === 'command') return 'Command';
    if (alias === 'ctrl' || alias === 'control') return 'Control';
    if (alias === 'option' || alias === 'alt') return 'Alt';
    if (alias === 'shift') return 'Shift';
    if (token === ' ') return 'Space';
    return /^[a-z0-9`~!@#$%^&*()_+\-=[\]{};':",./<>?\\|]+$/iu.test(token) ? token : '';
  });
  if (normalized.some((token) => !token)) return null;
  return normalized.join('+');
}

export function resolveGlobalCaptureAccelerators(rawOverrides: unknown, platform: NodeJS.Platform) {
  const fallback = getDefaultGlobalCaptureAccelerator(platform);
  if (!fallback) return [];
  if (!rawOverrides || typeof rawOverrides !== 'object' || Array.isArray(rawOverrides)) return [fallback];
  const entry = (rawOverrides as Record<string, unknown>)[GLOBAL_CAPTURE_COMMAND_ID];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [fallback];
  const accelerators = ['primary', 'secondary']
    .map((slot) => normalizeAccelerator((entry as Record<string, unknown>)[slot]))
    .filter((value): value is string => Boolean(value));
  return accelerators.length ? Array.from(new Set(accelerators)) : [fallback];
}
