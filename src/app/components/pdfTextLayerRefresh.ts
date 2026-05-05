export function resolveTextLayerRefreshSignature(shell: HTMLDivElement | null) {
  if (!shell) {
    return null;
  }
  const textLayers = Array.from(shell.querySelectorAll<HTMLElement>('.textLayer'));
  if (textLayers.length === 0) {
    return null;
  }
  const childCount = textLayers.reduce((total, layer) => total + layer.childElementCount, 0);
  const textLength = textLayers.reduce((total, layer) => total + (layer.textContent ?? '').trim().length, 0);
  return `${textLayers.length}:${childCount}:${textLength}`;
}

export function shouldRefreshTextLayer(args: {
  pageNumber: number;
  previousSignatures: Record<number, string>;
  shell: HTMLDivElement | null;
}) {
  const signature = resolveTextLayerRefreshSignature(args.shell);
  if (!signature) {
    return false;
  }
  return args.previousSignatures[args.pageNumber] !== signature;
}
