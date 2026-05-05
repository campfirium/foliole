type WorkspaceSurfaceClipboardType = 'alpha' | 'hex' | 'hsl' | 'rgb';

type WorkspaceSurfaceClipboardPayload = {
  type: WorkspaceSurfaceClipboardType;
  value: string;
};

let workspaceSurfaceClipboardPayload: WorkspaceSurfaceClipboardPayload | null = null;

function parseRgbRow(value: string) {
  const matches = value.match(/\d+/g);
  if (!matches || matches.length < 3) {
    return null;
  }
  return matches.slice(0, 3).map((item) => Number(item));
}

function parseHslRow(value: string) {
  const matches = value.match(/\d+/g);
  if (!matches || matches.length < 3) {
    return null;
  }
  return matches.slice(0, 3).map((item) => Number(item));
}

function parseAlphaRow(value: string) {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : null;
}

async function writeClipboardText(value: string) {
  if (!navigator.clipboard?.writeText) {
    return;
  }
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // Ignore clipboard permission failures and keep the in-memory fallback.
  }
}

async function readClipboardText() {
  if (!navigator.clipboard?.readText) {
    return null;
  }
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

export async function copyWorkspaceSurfaceRow(type: WorkspaceSurfaceClipboardType, value: string) {
  workspaceSurfaceClipboardPayload = { type, value };
  await writeClipboardText(value);
}

export async function pasteWorkspaceSurfaceRow(type: WorkspaceSurfaceClipboardType) {
  const clipboardText = await readClipboardText();
  const fallbackValue = workspaceSurfaceClipboardPayload?.type === type ? workspaceSurfaceClipboardPayload.value : null;
  const value = clipboardText?.trim() || fallbackValue;
  if (!value) {
    return null;
  }
  if (type === 'hex') {
    return value;
  }
  if (type === 'rgb') {
    return parseRgbRow(value);
  }
  if (type === 'hsl') {
    return parseHslRow(value);
  }
  return parseAlphaRow(value);
}
