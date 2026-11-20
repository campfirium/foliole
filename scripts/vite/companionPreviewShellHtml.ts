import path from 'node:path';

export function companionPreviewShellHtml(projectRoot: string, sandbox = false) {
  const module = `/@fs/${path.resolve(projectRoot, 'scripts/vite/companionPreviewShell.ts').replace(/^\/+/u, '')}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${sandbox ? 'Foliole mobile sandbox' : 'Foliole preview'}</title><style>
html,body{margin:0;width:100%;height:100%;font:14px system-ui;color-scheme:light dark}
body{overflow:hidden}
.preview-data-note{position:absolute;top:12px;left:16px;max-width:260px;margin:0;color:GrayText;font:12px/1.6 system-ui}
@media(max-width:650px){.preview-data-note{top:auto;bottom:4px;left:12px;right:12px;max-width:none;font-size:10px}}
body[data-preview-sandbox]{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr)}
.sandbox-stage{position:relative;min-width:0;min-height:0}
.sandbox-audit{overflow:auto;padding:20px;border-left:1px solid color-mix(in srgb,CanvasText 18%,transparent)}
.sandbox-audit h2{margin:0 0 6px;font-size:19px}
.sandbox-audit p{margin:0 0 14px;color:GrayText}
.sandbox-audit table{width:100%;table-layout:fixed;border-spacing:0;line-height:1.45;font-size:13px}
.sandbox-audit th,.sandbox-audit td{text-align:left;vertical-align:top;padding:8px;border-bottom:1px solid color-mix(in srgb,CanvasText 14%,transparent);overflow-wrap:anywhere}
.sandbox-audit th{position:sticky;top:0;background:Canvas}
@media(max-width:850px){body[data-preview-sandbox]{display:block;overflow:auto}.sandbox-stage{height:100dvh}.sandbox-audit{border-left:0;border-top:1px solid GrayText;padding:12px}}
.sandbox-toolbar{position:absolute;z-index:2;left:50%;transform:translateX(-50%);display:flex;justify-content:center}
.sandbox-scenarios{position:relative;max-width:100%;font-size:13px}
.sandbox-scenarios summary{display:flex;align-items:center;justify-content:center;gap:8px;min-height:32px;padding:0 11px;border:1px solid color-mix(in srgb,CanvasText 15%,transparent);border-radius:8px;background:Canvas;color:CanvasText;list-style:none;cursor:pointer;white-space:nowrap}
.sandbox-scenarios summary::-webkit-details-marker{display:none}
.sandbox-scenarios summary::after{content:'';width:5px;height:5px;border-right:1px solid currentColor;border-bottom:1px solid currentColor;transform:translateY(-1px) rotate(45deg);opacity:.65}
.sandbox-scenarios[open] summary,.sandbox-scenarios summary:hover{background:color-mix(in srgb,CanvasText 5%,Canvas)}
.sandbox-scenarios summary.is-active::before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.65}
.sandbox-scenario-items{position:absolute;top:calc(100% + 4px);left:50%;transform:translateX(-50%);min-width:152px;padding:4px;border:1px solid color-mix(in srgb,CanvasText 15%,transparent);border-radius:9px;background:Canvas;box-shadow:0 6px 18px color-mix(in srgb,CanvasText 13%,transparent)}
.sandbox-scenario-items label{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px;border-radius:5px;cursor:pointer}
.sandbox-scenario-items label:hover{background:color-mix(in srgb,CanvasText 6%,Canvas)}
.sandbox-scenario-items input{margin:0}
.preview-viewport{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(var(--preview-scale));transform-origin:center}
.preview-status-bar{position:absolute;inset:0 0 auto;height:var(--preview-status-bar-height);box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;padding:0 22px 0 28px;background:Canvas;color:CanvasText;font:600 15px -apple-system,BlinkMacSystemFont,system-ui,sans-serif;letter-spacing:-.3px;user-select:none;pointer-events:none}
.preview-status-icons{display:flex;align-items:center;gap:6px}
.preview-content{position:absolute;left:0;right:0;top:var(--preview-status-bar-height);height:var(--preview-content-height)}
iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
[hidden]{display:none!important}
.preview-update{position:absolute;inset:0;display:flex;align-items:flex-start;justify-content:center;gap:12px;padding:16px;box-sizing:border-box;z-index:2}
.preview-update [role=status],button{background:Canvas;color:CanvasText;border:1px solid color-mix(in srgb,CanvasText 15%,transparent);border-radius:8px;padding:10px 12px;font:inherit}
.is-updating [role=status]::before{content:"";display:inline-block;width:12px;height:12px;margin-right:8px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-2px;animation:spin .8s linear infinite}
button{cursor:pointer;min-height:40px}
@keyframes spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.is-updating [role=status]::before{animation:none}}
</style></head><body data-companion-preview-shell="true"${sandbox ? ' data-preview-sandbox="true"' : ''}>
<script type="module" src="${module}"></script></body></html>`;
}
