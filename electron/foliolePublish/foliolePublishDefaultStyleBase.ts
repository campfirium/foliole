export const DEFAULT_THEME_STYLE_BASE = `:root {
  color-scheme: light;
  --canvas: #ffffff;
  --foreground: #202124;
  --body: #414441;
  --muted: rgba(32, 33, 36, 0.58);
  --faint: rgba(32, 33, 36, 0.38);
  --focus: rgba(32, 33, 36, 0.62);
  --selection: rgba(56, 118, 255, 0.18);
  --measure: 680px;
  --font-ui: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Noto Sans SC", sans-serif;
  --font-mono: "JetBrains Mono", "Cascadia Code", "SFMono-Regular", Menlo, Consolas, monospace;
  font-family: var(--font-ui);
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { min-height: 100vh; margin: 0; background: var(--canvas); color: var(--foreground); }
::selection { background: var(--selection); }
a { color: inherit; text-decoration: none; }
a:focus-visible, input:focus-visible {
  outline: 1px solid var(--focus);
  outline-offset: 5px;
}

.shell { width: min(calc(100% - 48px), var(--measure)); margin-inline: auto; }
.view { padding: 70px 0 116px; }
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.home-title {
  margin: 0 0 92px;
  font-size: 28px;
  font-weight: 720;
  letter-spacing: -0.04em;
  line-height: 1.1;
}

.global-nav {
  display: flex;
  min-height: 44px;
  align-items: center;
  justify-content: flex-start;
  gap: 2px;
  margin-top: 76px;
  margin-left: -10px;
}
.icon-link {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  color: var(--muted);
}
.icon-link:hover, .icon-link[aria-current="page"] { color: var(--foreground); }
.icon-link svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.55;
}

@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
@media print {
  .global-nav, .pagination, .search-form { display: none; }
  .view { padding-top: 0; }
}`;
