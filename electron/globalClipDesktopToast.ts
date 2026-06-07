import { BrowserWindow, nativeTheme, screen } from 'electron';

const TOAST_DISPLAY_MS = 1800;
const TOAST_HEIGHT = 64;
const TOAST_MARGIN = 18;
const TOAST_WIDTH = 304;
const THEME_READ_TIMEOUT_MS = 120;

interface GlobalClipToastTheme {
  accent: string;
  background: string;
  border: string;
  foreground: string;
  mutedForeground: string;
}

function fallbackToastTheme(): GlobalClipToastTheme {
  if (nativeTheme.shouldUseDarkColors) {
    return {
      accent: '#7fb18d',
      background: 'rgb(42, 45, 41)',
      border: 'rgb(80, 84, 78)',
      foreground: 'rgb(232, 230, 223)',
      mutedForeground: 'rgb(165, 164, 159)'
    };
  }
  return {
    accent: '#3f8f68',
    background: 'rgb(255, 255, 255)',
    border: 'rgb(188, 189, 187)',
    foreground: 'rgb(32, 33, 36)',
    mutedForeground: 'rgb(94, 95, 97)'
  };
}

function isCssColor(value: unknown): value is string {
  return typeof value === 'string' && /^[#(),.%/ 0-9a-zA-Z-]+$/u.test(value.trim());
}

function normalizeTheme(input: unknown): GlobalClipToastTheme {
  const fallback = fallbackToastTheme();
  if (!input || typeof input !== 'object') {
    return fallback;
  }
  const candidate = input as Partial<GlobalClipToastTheme>;
  return {
    accent: isCssColor(candidate.accent) ? candidate.accent : fallback.accent,
    background: isCssColor(candidate.background) ? candidate.background : fallback.background,
    border: isCssColor(candidate.border) ? candidate.border : fallback.border,
    foreground: isCssColor(candidate.foreground) ? candidate.foreground : fallback.foreground,
    mutedForeground: isCssColor(candidate.mutedForeground) ? candidate.mutedForeground : fallback.mutedForeground
  };
}

async function readToastThemeFromAppWindow(excludedWindow: BrowserWindow): Promise<GlobalClipToastTheme> {
  const window = BrowserWindow.getAllWindows().find((candidate) => candidate !== excludedWindow && !candidate.isDestroyed());
  if (!window) {
    return fallbackToastTheme();
  }
  const theme = await window.webContents.executeJavaScript(`
    (() => {
      const root = document.documentElement;
      const readColor = (property, value, fallback) => {
        const probe = document.createElement('div');
        probe.style[property] = value;
        root.appendChild(probe);
        const computed = getComputedStyle(probe)[property] || fallback;
        probe.remove();
        return computed;
      };
      return {
        accent: readColor('backgroundColor', 'var(--app-accent-color)', '#3f8f68'),
        background: readColor('backgroundColor', 'var(--app-floating-surface-bg)', 'rgb(255, 255, 255)'),
        border: readColor('borderColor', 'var(--app-floating-border-color)', 'rgb(188, 189, 187)'),
        foreground: readColor('color', 'rgb(var(--color-foreground))', 'rgb(32, 33, 36)'),
        mutedForeground: readColor('color', 'rgb(var(--color-muted-foreground))', 'rgb(94, 95, 97)')
      };
    })()
  `, true);
  return normalizeTheme(theme);
}

function resolveToastTheme(excludedWindow: BrowserWindow): Promise<GlobalClipToastTheme> {
  return Promise.race([
    readToastThemeFromAppWindow(excludedWindow).catch(() => fallbackToastTheme()),
    new Promise<GlobalClipToastTheme>((resolve) => {
      globalThis.setTimeout(() => resolve(fallbackToastTheme()), THEME_READ_TIMEOUT_MS);
    })
  ]);
}

function closeToastAfterDisplay(toastWindow: BrowserWindow) {
  globalThis.setTimeout(() => {
    if (!toastWindow.isDestroyed()) {
      toastWindow.close();
    }
  }, TOAST_DISPLAY_MS);
}

function buildToastHtml(theme: GlobalClipToastTheme) {
  const html = [
    '<!doctype html>',
    '<meta charset="utf-8">',
    '<style>',
    ':root{',
    `--toast-accent:${theme.accent};`,
    `--toast-bg:${theme.background};`,
    `--toast-border:${theme.border};`,
    `--toast-fg:${theme.foreground};`,
    `--toast-muted:${theme.mutedForeground};`,
    '}',
    'html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI Variable","Segoe UI","Microsoft YaHei UI",sans-serif;}',
    'body{display:flex;align-items:center;justify-content:center;padding:0;}',
    '.toast{box-sizing:border-box;display:grid;grid-template-columns:26px 1fr auto;align-items:center;gap:10px;width:100%;height:100%;border:1px solid var(--toast-border);border-radius:8px;background:var(--toast-bg);color:var(--toast-fg);box-shadow:0 12px 28px rgba(0,0,0,.18);font-size:14px;}',
    '.mark{justify-self:end;width:10px;height:10px;border-radius:999px;background:var(--toast-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--toast-accent) 18%,transparent);}',
    '.content{display:grid;gap:2px;min-width:0;}',
    '.title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;line-height:18px;}',
    '.meta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--toast-muted);font-size:12px;line-height:16px;}',
    '.badge{margin-right:14px;border:1px solid color-mix(in srgb,var(--toast-border) 72%,transparent);border-radius:999px;padding:2px 8px;color:var(--toast-muted);font-size:11px;line-height:14px;}',
    '</style>',
    '<div class="toast" role="status"><span class="mark"></span><span class="content"><span class="title">Clipped to Inbox</span><span class="meta">Ready to process</span></span><span class="badge">Inbox</span></div>'
  ].join('');
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

export function showGlobalClipDesktopToast() {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;
  const toastWindow = new BrowserWindow({
    alwaysOnTop: true,
    focusable: false,
    frame: false,
    height: TOAST_HEIGHT,
    resizable: false,
    show: false,
    skipTaskbar: true,
    transparent: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    width: TOAST_WIDTH,
    x: x + width - TOAST_WIDTH - TOAST_MARGIN,
    y: y + height - TOAST_HEIGHT - TOAST_MARGIN
  });
  toastWindow.setAlwaysOnTop(true, 'screen-saver');
  toastWindow.setIgnoreMouseEvents(true);
  void resolveToastTheme(toastWindow)
    .then((theme) => toastWindow.loadURL(buildToastHtml(theme)))
    .then(() => {
      if (!toastWindow.isDestroyed()) {
        toastWindow.showInactive();
        closeToastAfterDisplay(toastWindow);
      }
    });
}
