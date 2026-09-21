export function classifyS220ResourceImage(image) {
  if (!image.widget?.present) return 'editor_viewport_projection';
  if (!image.local?.exists || !image.local?.hashMatches
    || image.resolver?.status !== 'ready' || !image.resolver?.resource_url) return 'native_resolver';
  if (!image.dom || !image.fetch?.ok
    || image.fetch.bytes !== image.local.size) return 'widget_local_url_handoff';
  if (image.decode?.status !== 'decoded') return 'webview_decode';
  if (!image.dom.complete || image.dom.naturalWidth <= 0) return 'editor_widget_lifecycle';
  return 'healthy';
}

export function classifyS220ResourceDiagnostic(document, images) {
  if (!document?.bodyReadable) return { resultStatus: 'localized',
    failures: ['document_hydration_navigation'], results: [] };
  const results = images.map((image) => ({ hash: image.hash,
    layer: classifyS220ResourceImage(image) }));
  const failures = [...new Set(results.map((result) => result.layer)
    .filter((layer) => layer !== 'healthy'))];
  if (failures.length === 0 && document.loadedImages !== images.length) {
    failures.push('acceptance_oracle');
  }
  return { resultStatus: failures.length === 0 ? 'healthy'
    : failures.length === 1 ? 'localized' : 'ambiguous', failures, results };
}
