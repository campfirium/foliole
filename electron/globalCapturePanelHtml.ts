import {
  buildFloatingThemeStyle,
  escapeHtml,
  type GlobalCaptureFloatingTheme
} from './globalCaptureFloatingSurface.js';

export function buildGlobalCapturePanelHtml(theme: GlobalCaptureFloatingTheme) {
  const chevronDown = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m8 9 4 4 4-4"/></svg>';
  const chevronRight = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m8 7 4 5-4 5"/></svg>';
  const html = [
    '<!doctype html>',
    '<meta charset="utf-8">',
    '<style>',
    buildFloatingThemeStyle(theme),
    'html,body{height:100%;}',
    'body{box-sizing:border-box;padding:26px;-webkit-app-region:drag;app-region:drag;}',
    '.panel{position:relative;display:grid;grid-template-rows:minmax(0,auto) auto;width:520px;min-height:188px;max-height:420px;overflow:hidden;padding:0;-webkit-app-region:no-drag;app-region:no-drag;}',
    '.drag-strip{position:absolute;left:0;right:0;top:0;z-index:1;height:18px;cursor:grab;-webkit-app-region:no-drag;app-region:no-drag;}',
    '.drag-strip:active{cursor:grabbing;}',
    'textarea{box-sizing:border-box;display:block;width:100%;height:144px;min-height:144px;max-height:376px;resize:none;border:0;outline:0;overflow:hidden;background:var(--capture-input-bg);color:var(--capture-fg);font:400 var(--capture-input-font-size)/var(--capture-input-line-height) var(--capture-input-font-family);padding:var(--capture-input-padding-block-start) var(--capture-content-inline-padding) var(--capture-input-padding-block-end);scrollbar-width:none;-webkit-app-region:no-drag;app-region:no-drag;}',
    'textarea::-webkit-scrollbar{display:none;width:0;height:0;}',
    'textarea::placeholder{color:var(--capture-placeholder);font-weight:400;}',
    '.footer{display:grid;min-height:44px;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;border-top:1px solid var(--capture-divider);padding:6px var(--capture-content-inline-padding);background:transparent;-webkit-app-region:no-drag;app-region:no-drag;}',
    '.hint{display:flex;min-width:0;align-items:center;gap:4px;overflow:hidden;color:var(--capture-muted);font:400 12px/18px var(--capture-ui-font-family);}',
    '.hint-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.hint-toggle{display:inline-flex;width:22px;height:22px;margin-left:-6px;align-items:center;justify-content:center;border:0;border-radius:6px;background:transparent;color:color-mix(in srgb,var(--capture-muted) 76%,transparent);padding:0;cursor:pointer;-webkit-app-region:no-drag;app-region:no-drag;}',
    '.hint-toggle:hover{color:var(--capture-fg);background:var(--capture-control-hover-bg);}',
    '.hint-toggle svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}',
    'body[data-hint-visible="false"] .hint-expanded{display:none;}',
    'body[data-hint-visible="true"] .hint-collapsed{display:none;}',
    '.actions{display:flex;align-items:center;gap:8px;}',
    '.primary{min-width:58px;min-height:32px;border:1px solid var(--capture-control-border);border-radius:var(--capture-control-radius);background:transparent;color:var(--capture-control-fg);font:400 13px/18px var(--capture-ui-font-family);padding:5px 14px;cursor:pointer;-webkit-app-region:no-drag;app-region:no-drag;}',
    '.primary:hover{border-color:var(--capture-control-border-hover);background:var(--capture-control-hover-bg);color:var(--capture-fg);}',
    '</style>',
    `<body data-hint-visible="${theme.hintVisible ? 'true' : 'false'}"><form class="capture-surface panel" id="form"><div aria-hidden="true" class="drag-strip" id="drag-strip"></div><textarea id="capture" autofocus placeholder="${escapeHtml(theme.strings.placeholder)}"></textarea><div class="footer"><div class="hint"><button aria-expanded="true" aria-label="${escapeHtml(theme.strings.hideHintLabel)}" class="hint-expanded hint-toggle" id="hide-hint" type="button">${chevronDown}</button><span class="hint-expanded hint-text">${escapeHtml(theme.strings.hint)}</span><button aria-expanded="false" aria-label="${escapeHtml(theme.strings.showHintLabel)}" class="hint-collapsed hint-toggle" id="show-hint" type="button">${chevronRight}</button></div><div class="actions"><button class="primary" type="submit">${escapeHtml(theme.strings.save)}</button></div></div></form></body>`
  ].join('');
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
