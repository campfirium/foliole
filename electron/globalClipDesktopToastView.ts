import {
  buildFloatingThemeStyle,
  escapeHtml,
  type GlobalCaptureFloatingTheme,
  truncateCapturePreview
} from './globalCaptureFloatingSurface.js';
import { buildBrandMarkHtml } from './globalClipDesktopToastBrand.js';
import {
  resolveToastText,
  serializeToastState,
  type GlobalClipToastLocale,
  type GlobalClipToastStatus
} from './globalClipDesktopToastState.js';

function resolveToastView(status: GlobalClipToastStatus, previewTitle?: string | null, locale?: GlobalClipToastLocale) {
  const text = resolveToastText(status, locale);
  const preview = previewTitle ? truncateCapturePreview(previewTitle) : '';
  return { meta: text.meta, title: status === 'success' && preview ? preview : text.title };
}

export function buildToastHtml(theme: GlobalCaptureFloatingTheme, status: GlobalClipToastStatus) {
  const text = resolveToastView(status, null, theme.strings.locale);
  const html = [
    '<!doctype html>',
    '<meta charset="utf-8">',
    '<style data-capture-theme="true">',
    buildFloatingThemeStyle(theme),
    '</style>',
    '<style>',
    'body{padding:22px;}',
    '.toast{display:grid;grid-template-columns:16px 1fr 18px;align-items:center;gap:12px;width:100%;height:100%;padding:0 18px;font-size:14px;}',
    '.mark{justify-self:center;width:8px;height:8px;border-radius:999px;background:var(--capture-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--capture-accent) 16%,transparent);}',
    '.toast[data-status="pending"] .mark{width:12px;height:12px;border:2px solid color-mix(in srgb,var(--capture-muted) 28%,transparent);border-top-color:var(--capture-accent);background:transparent;box-shadow:none;animation:spin .9s linear infinite;}',
    '.toast[data-status="copyFailed"] .mark,.toast[data-status="empty"] .mark,.toast[data-status="importFailed"] .mark,.toast[data-status="permissionRequired"] .mark{background:var(--capture-muted);box-shadow:0 0 0 3px color-mix(in srgb,var(--capture-muted) 16%,transparent);}',
    '@keyframes spin{to{transform:rotate(360deg);}}',
    '.content{display:grid;gap:2px;min-width:0;}',
    '.title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--capture-title-fg);font-weight:500;line-height:20px;}',
    '.meta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--capture-muted);font-size:12px;line-height:16px;}',
    '.brand{display:flex;width:18px;height:18px;align-items:center;justify-content:center;justify-self:center;opacity:.36;}',
    '.brand img{display:block;width:auto;height:18px;object-fit:contain;}',
    '.brand-fallback{display:block;width:14px;height:16px;border-radius:6px;background:color-mix(in srgb,var(--capture-accent) 20%,transparent);}',
    '.toast[data-clickable="true"]{cursor:pointer;}',
    '</style>',
    `<div class="capture-surface toast" data-clickable="false" data-status="${status}" role="status"><span class="mark"></span><span class="content"><span class="title">${escapeHtml(text.title)}</span><span class="meta">${escapeHtml(text.meta)}</span></span><span class="brand">${buildBrandMarkHtml()}</span></div>`
  ].join('');
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

export function buildToastUpdateScript(
  status: GlobalClipToastStatus,
  targetNodeId: string | null,
  previewTitle: string | null,
  locale?: GlobalClipToastLocale
) {
  const text = resolveToastView(status, previewTitle, locale);
  return `
    (() => {
      const state = ${serializeToastState(status, locale)};
      const titleText = ${JSON.stringify(text.title)};
      const metaText = ${JSON.stringify(text.meta)};
      const targetNodeId = ${JSON.stringify(targetNodeId)};
      const toast = document.querySelector('.toast');
      const title = document.querySelector('.title');
      const meta = document.querySelector('.meta');
      if (!toast || !title || !meta) return;
      toast.dataset.status = state.status;
      toast.dataset.clickable = state.status === 'success' && Boolean(targetNodeId) ? 'true' : 'false';
      toast.dataset.targetNodeId = targetNodeId ?? '';
      title.textContent = titleText;
      meta.textContent = metaText;
    })()
  `;
}
