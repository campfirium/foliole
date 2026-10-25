import path from 'node:path';

export function companionPreviewShellHtml(projectRoot: string) {
  const module = `/@fs/${path.resolve(projectRoot, 'scripts/vite/companionPreviewShell.ts').replace(/^\/+/u, '')}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Foliole preview</title><style>
html,body{margin:0;width:100%;height:100%;font:14px system-ui;color-scheme:light dark}
iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
[hidden]{display:none!important}
.preview-update{position:fixed;inset:0;display:flex;align-items:flex-start;justify-content:center;gap:12px;padding:16px;box-sizing:border-box;z-index:2}
.preview-update [role=status],button{background:Canvas;color:CanvasText;border:1px solid color-mix(in srgb,CanvasText 15%,transparent);border-radius:8px;padding:10px 12px;font:inherit}
.is-updating [role=status]::before{content:"";display:inline-block;width:12px;height:12px;margin-right:8px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-2px;animation:spin .8s linear infinite}
button{cursor:pointer;min-height:40px}
@keyframes spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.is-updating [role=status]::before{animation:none}}
</style></head><body data-companion-preview-shell="true">
<script type="module" src="${module}"></script></body></html>`;
}
