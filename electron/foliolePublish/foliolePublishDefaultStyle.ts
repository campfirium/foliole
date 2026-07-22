export const DEFAULT_THEME_STYLE = `:root {
  color-scheme: light dark;
  --canvas: #ffffff;
  --background: #f5f5f3;
  --foreground: #202124;
  --muted: rgba(32, 33, 36, 0.58);
  --faint: rgba(32, 33, 36, 0.42);
  --border: rgba(32, 33, 36, 0.18);
  --border-strong: rgba(32, 33, 36, 0.34);
  --accent: #3f8f68;
  --code: #f6f6f6;
  --selection: rgba(56, 118, 255, 0.18);
  --measure: 720px;
  --frame: 960px;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable", "Segoe UI", "PingFang SC", sans-serif;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { display: grid; min-height: 100vh; grid-template-rows: auto 1fr auto; margin: 0; background: var(--canvas); color: var(--foreground); }
::selection { background: var(--selection); }
a { color: inherit; text-underline-offset: .18em; }
a:focus-visible { outline: 1px solid var(--border-strong); outline-offset: 4px; border-radius: 4px; }
.site-header, .site-footer {
  width: min(var(--frame), calc(100% - 48px));
  margin-inline: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  color: var(--muted);
  font-size: .82rem;
}
.site-header { min-height: 64px; border-bottom: 1px solid var(--border); }
.site-name { color: var(--foreground); font-size: .92rem; font-weight: 620; letter-spacing: -.01em; text-decoration: none; }
.site-nav { display: flex; gap: 20px; }
.site-nav a, .site-footer a { text-decoration: none; }
.site-nav a:hover, .site-nav a[aria-current="page"], .site-footer a:hover { color: var(--foreground); }
.page-shell { width: min(var(--measure), calc(100% - 48px)); margin-inline: auto; padding: 64px 0 72px; }
.topics-header { display: flex; align-items: baseline; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
h1 { margin: 0; color: var(--foreground); font-size: clamp(2rem, 5vw, 2.75rem); font-weight: 620; letter-spacing: -.035em; line-height: 1.08; }
.topics-header h1 { font-size: 1.5rem; letter-spacing: -.02em; }
.topics-header p { margin: 0; color: var(--muted); font-size: .8rem; }
.topic-list { margin: 0; padding: 0; border-top: 1px solid var(--border); list-style: none; }
.topic-list li { border-bottom: 1px solid var(--border); }
.topic-list a { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: baseline; gap: 24px; padding: 16px 4px; text-decoration: none; }
.topic-list a:hover { background: color-mix(in srgb, var(--background) 74%, transparent); }
.topic-list a > span { overflow: hidden; font-size: .95rem; font-weight: 520; line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; }
.topic-list time { color: var(--muted); font-size: .75rem; white-space: nowrap; }
.article-header { margin-bottom: 40px; }
.article-header > time { display: block; margin-bottom: 12px; color: var(--muted); font-size: .75rem; }
.fields { display: flex; flex-wrap: wrap; gap: 12px 28px; margin: 28px 0 0; padding: 14px 0; border-block: 1px solid var(--border); }
.field { min-width: 112px; }
.field dt { margin-bottom: 5px; color: var(--faint); font-size: .68rem; letter-spacing: .04em; text-transform: uppercase; }
.field dd { display: flex; flex-wrap: wrap; gap: 5px; margin: 0; font-size: .82rem; }
.field dd span:not(:last-child)::after { content: ","; }
.prose { font-size: 1.06rem; line-height: 1.75; }
.prose > * { margin-block: 0 1.35em; }
.prose h2, .prose h3 { margin: 2.1em 0 .65em; line-height: 1.25; letter-spacing: -.02em; }
.prose h2 { font-size: 1.45em; }
.prose h3 { font-size: 1.18em; }
.prose a { color: var(--accent); }
.prose blockquote { margin-inline: 0; padding-left: 1em; border-left: 2px solid var(--accent); color: var(--muted); }
.prose img, .prose video { max-width: 100%; height: auto; border-radius: 8px; }
.prose pre { overflow-x: auto; padding: 16px; border: 1px solid var(--border); border-radius: 8px; background: var(--code); font-size: .84em; line-height: 1.6; }
.prose code { padding: .12em .3em; border-radius: 4px; background: var(--code); font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace; font-size: .86em; }
.prose pre code { padding: 0; background: transparent; }
.prose table { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; font-size: .86em; }
.prose th, .prose td { padding: 10px 12px; border: 1px solid var(--border); text-align: left; }
.prose hr { margin: 2.5em 0; border: 0; border-top: 1px solid var(--border); }
.back-link { display: inline-block; margin-top: 48px; color: var(--muted); font-size: .82rem; text-decoration: none; }
.back-link span { margin-right: 7px; }
.back-link:hover { color: var(--foreground); }
.site-footer { min-height: 76px; border-top: 1px solid var(--border); }
@media (max-width: 680px) {
  .site-header, .site-footer, .page-shell { width: min(100% - 32px, var(--measure)); }
  .site-header { min-height: 56px; }
  .page-shell { padding: 44px 0 56px; }
  .topics-header { align-items: flex-start; flex-direction: column; gap: 6px; margin-bottom: 20px; }
  .topic-list a { gap: 12px; padding: 15px 2px; }
  .article-header { margin-bottom: 32px; }
  .fields { display: grid; grid-template-columns: 1fr 1fr; }
}
@media (prefers-color-scheme: dark) {
  :root { --canvas: #202124; --background: #292a2d; --foreground: #f1f3f4; --muted: rgba(241, 243, 244, .62); --faint: rgba(241, 243, 244, .44); --border: rgba(241, 243, 244, .18); --border-strong: rgba(241, 243, 244, .34); --accent: #8fc7a8; --code: #292a2d; --selection: rgba(56, 118, 255, .32); }
}
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
@media print { .site-header, .site-footer, .back-link { display: none; } .page-shell { padding-top: 0; } body { background: white; color: black; } }
`;
