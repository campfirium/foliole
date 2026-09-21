export function classifyS220ResourceImage(image) {
  if (!image.local?.exists || !image.local?.hashMatches
    || image.resolver?.status !== 'ready' || !image.resolver?.resource_url) return 'native_resolver';
  if (!image.fetch?.ok || image.fetch.bytes !== image.local.size) return 'local_url_handler';
  if (image.decode?.status !== 'decoded') return 'webview_decode';
  if (!image.dom?.complete || image.dom.naturalWidth <= 0) return 'editor_widget';
  return 'healthy';
}

export function classifyS220ResourceDiagnostic(images) {
  const results = images.map((image) => ({ hash: image.hash,
    layer: classifyS220ResourceImage(image) }));
  const failures = [...new Set(results.map((result) => result.layer)
    .filter((layer) => layer !== 'healthy'))];
  return { resultStatus: failures.length === 0 ? 'healthy'
    : failures.length === 1 ? 'localized' : 'ambiguous', failures, results };
}
