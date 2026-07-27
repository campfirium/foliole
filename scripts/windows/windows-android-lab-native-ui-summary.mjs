export function nativeUiSummary(xml, size, inputState) {
  const nodes = [];
  for (const match of String(xml).matchAll(/<node\s+([^>]+)>?/gu)) {
    const attributes = Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/gu)].map((entry) => [entry[1], entry[2]]));
    nodes.push({
      bounds: attributes.bounds || '',
      className: attributes.class || '',
      clickable: attributes.clickable === 'true',
      enabled: attributes.enabled !== 'false',
      focused: attributes.focused === 'true',
      packageName: attributes.package || '',
      resourceId: attributes['resource-id'] || '',
      selected: attributes.selected === 'true'
    });
  }
  const physicalSize = /Physical size:\s*(\d+x\d+)/iu.exec(size)?.[1] || '';
  const orientation = /SurfaceOrientation:\s*(\d+)/iu.exec(inputState)?.[1] || '';
  return { device: { orientation, physicalSize }, nodes: nodes.slice(0, 500), schemaVersion: 1 };
}
