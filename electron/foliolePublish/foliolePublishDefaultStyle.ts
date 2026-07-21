export const DEFAULT_THEME_STYLE = `:root {
  color-scheme: light dark;
  --canvas: #f7f5ef;
  --surface: #fffefb;
  --ink: #24231f;
  --muted: #6d6a61;
  --line: #d9d5ca;
  --accent: #365f4a;
  --code: #eeece5;
  --selection: #dce9df;
  --measure: 720px;
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: var(--canvas); color: var(--ink); }
::selection { background: var(--selection); }
a { color: inherit; text-underline-offset: .18em; }
a:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; border-radius: 2px; }
.site-header, .site-footer {
  width: min(1120px, calc(100% - 48px));
  margin-inline: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  color: var(--muted);
  font-size: .84rem;
}
.site-header { min-height: 76px; border-bottom: 1px solid var(--line); }
.site-name { color: var(--ink); font-weight: 650; letter-spacing: -.01em; text-decoration: none; }
.site-nav { display: flex; gap: 24px; }
.site-nav a { text-decoration: none; }
.site-nav a:hover, .site-nav a[aria-current="page"] { color: var(--ink); }
.page-shell { width: min(var(--measure), calc(100% - 48px)); margin-inline: auto; padding: 88px 0 64px; }
.article-header { margin-bottom: 56px; }
.article-kicker { display: flex; gap: 12px; margin-bottom: 18px; color: var(--muted); font-size: .78rem; letter-spacing: .05em; text-transform: uppercase; }
.article-kicker span::after { content: "·"; margin-left: 12px; }
h1 { margin: 0; font-family: ui-serif, Georgia, Cambria, serif; font-size: clamp(2.5rem, 8vw, 5.4rem); font-weight: 520; letter-spacing: -.045em; line-height: .98; }
.fields { display: flex; flex-wrap: wrap; gap: 12px 28px; margin: 36px 0 0; padding: 18px 0; border-block: 1px solid var(--line); }
.field { min-width: 120px; }
.field dt { margin-bottom: 7px; color: var(--muted); font-size: .72rem; letter-spacing: .07em; text-transform: uppercase; }
.field dd { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; font-size: .9rem; }
.field dd span:not(:last-child)::after { content: ","; }
.prose { font-family: ui-serif, Georgia, Cambria, serif; font-size: clamp(1.08rem, 2.2vw, 1.22rem); line-height: 1.78; }
.prose > * { margin-block: 0 1.45em; }
.prose h2, .prose h3 { margin: 2.2em 0 .7em; line-height: 1.2; letter-spacing: -.025em; }
.prose h2 { font-size: 1.65em; }
.prose h3 { font-size: 1.25em; }
.prose a { color: var(--accent); }
.prose blockquote { margin-inline: 0; padding-left: 1.25em; border-left: 2px solid var(--accent); color: var(--muted); }
.prose img, .prose video { max-width: 100%; height: auto; border-radius: 8px; }
.prose pre { overflow-x: auto; padding: 18px 20px; border: 1px solid var(--line); border-radius: 8px; background: var(--code); font-size: .82em; line-height: 1.6; }
.prose code { padding: .12em .3em; border-radius: 4px; background: var(--code); font-family: ui-monospace, "SFMono-Regular", Consolas, monospace; font-size: .86em; }
.prose pre code { padding: 0; background: transparent; }
.prose table { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; font-family: ui-sans-serif, sans-serif; font-size: .86em; }
.prose th, .prose td { padding: 10px 14px; border: 1px solid var(--line); text-align: left; }
.prose hr { margin: 3em 0; border: 0; border-top: 1px solid var(--line); }
.topic-navigation { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 72px; padding-top: 28px; border-top: 1px solid var(--line); }
.topic-link { display: grid; gap: 7px; text-decoration: none; }
.topic-link span { color: var(--muted); font-size: .75rem; letter-spacing: .06em; text-transform: uppercase; }
.topic-link strong { font-family: ui-serif, Georgia, serif; font-size: 1.08rem; font-weight: 520; line-height: 1.35; }
.topic-link.older { text-align: right; }
.topic-link:hover strong { color: var(--accent); }
.site-footer { min-height: 92px; border-top: 1px solid var(--line); }
.keyboard-hint { font-size: .72rem; }
kbd { padding: 2px 5px; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 4px; background: var(--surface); font: inherit; }
.archive-shell { padding-top: 88px; }
.archive-header { margin-bottom: 52px; }
.archive-header p { margin: 0 0 14px; color: var(--muted); font-size: .78rem; letter-spacing: .06em; text-transform: uppercase; }
.archive-header h1 { margin-bottom: 20px; }
.archive-header span { color: var(--muted); }
.archive-list { margin: 0; padding: 0; border-top: 1px solid var(--line); list-style: none; }
.archive-list li { border-bottom: 1px solid var(--line); }
.archive-list a { display: grid; grid-template-columns: 1fr auto; align-items: baseline; gap: 24px; padding: 22px 0; text-decoration: none; }
.archive-list a > span { font-family: ui-serif, Georgia, serif; font-size: 1.22rem; line-height: 1.3; }
.archive-list time { color: var(--muted); font-size: .78rem; white-space: nowrap; }
.archive-list a:hover > span { color: var(--accent); }
@media (max-width: 680px) {
  .site-header, .site-footer, .page-shell { width: min(100% - 32px, var(--measure)); }
  .site-header { min-height: 64px; }
  .site-nav { gap: 18px; }
  .page-shell, .archive-shell { padding-top: 56px; }
  .article-header { margin-bottom: 42px; }
  h1 { font-size: clamp(2.35rem, 13vw, 4rem); }
  .fields { display: grid; grid-template-columns: 1fr 1fr; }
  .topic-navigation { gap: 16px; margin-top: 56px; }
  .site-footer { align-items: flex-start; flex-direction: column; justify-content: center; }
  .keyboard-hint { display: none; }
  .archive-list a { grid-template-columns: 1fr; gap: 7px; padding: 19px 0; }
}
@media (prefers-color-scheme: dark) {
  :root { --canvas: #171815; --surface: #20211e; --ink: #eeece5; --muted: #aaa79d; --line: #3a3b36; --accent: #9bc8ad; --code: #242521; --selection: #31513e; }
}
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
@media print { .site-header, .site-footer, .topic-navigation { display: none; } .page-shell { padding-top: 0; } body { background: white; color: black; } }
`;
