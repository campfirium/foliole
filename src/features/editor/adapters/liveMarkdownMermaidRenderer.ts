import mermaid from 'mermaid';

let activeThemeSignature: string | null = null;

function resolveCssChannels(styles: CSSStyleDeclaration, name: string, fallback: string) {
  const value = styles.getPropertyValue(name).trim() || fallback;
  const channels = value
    .replaceAll(',', ' ')
    .split(/\s+/u)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
  if (channels.length < 3) return `rgb(${fallback.replaceAll(' ', ', ')})`;
  return `rgb(${channels.slice(0, 3).join(', ')})`;
}

function resolveCssFontFamily(styles: CSSStyleDeclaration) {
  const contentFont = styles.getPropertyValue('--content-panel-font-family').trim();
  const sansFont = styles.getPropertyValue('--font-family-sans').trim();
  return contentFont || sansFont || 'Inter, system-ui, sans-serif';
}

function resolveMermaidThemeConfig() {
  const root = document.documentElement;
  const styles = getComputedStyle(root);
  const darkMode = root.dataset.resolvedBaseColor === 'dark';
  const foreground = resolveCssChannels(styles, '--color-foreground', darkMode ? '232 230 223' : '32 33 36');
  const panel = resolveCssChannels(styles, '--color-bg-panel', darkMode ? '37 40 36' : '248 248 246');
  const elevated = resolveCssChannels(styles, '--color-bg-elevated', darkMode ? '42 45 41' : '255 255 255');
  const border = resolveCssChannels(styles, '--color-border-strong', darkMode ? '122 124 116' : '148 151 156');
  const fontFamily = resolveCssFontFamily(styles);
  const signature = [darkMode, foreground, panel, elevated, border, fontFamily].join('|');

  return {
    config: {
      htmlLabels: false,
      securityLevel: 'strict' as const,
      startOnLoad: false,
      theme: 'base' as const,
      themeVariables: {
        background: 'transparent',
        darkMode,
        fontFamily,
        lineColor: border,
        mainBkg: panel,
        primaryBorderColor: border,
        primaryColor: panel,
        primaryTextColor: foreground,
        secondaryColor: elevated,
        tertiaryColor: panel,
        textColor: foreground,
        titleColor: foreground
      }
    },
    signature
  };
}

function ensureMermaidInitialized() {
  const { config, signature } = resolveMermaidThemeConfig();
  if (activeThemeSignature === signature) return;
  mermaid.initialize(config);
  activeThemeSignature = signature;
}

export async function renderMermaidSvg(id: string, source: string) {
  ensureMermaidInitialized();
  return mermaid.render(id, source);
}
