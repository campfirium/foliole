/** Copies pixels and DOM into a script-free document, never a second product runtime. */
export async function captureCompanionPreview(source: Document, target: Document) {
  target.open();
  target.write(`${source.compatMode === 'CSS1Compat' ? '<!doctype html>' : ''}<html><head></head><body></body></html>`);
  target.close();
  const root = target.importNode(source.documentElement, true);
  const originals = [...source.documentElement.querySelectorAll('*')];
  const copies = [...root.querySelectorAll('*')];
  const bitmaps: HTMLImageElement[] = [];
  for (const [index, original] of originals.entries()) {
    const copy = copies[index];
    if (!copy) continue;
    if (original instanceof source.defaultView!.HTMLCanvasElement) {
      bitmaps.push(copyCanvas(original, copy, source.defaultView!, target));
    }
    for (const attribute of [...copy.attributes]) {
      if (attribute.name.startsWith('on')) copy.removeAttribute(attribute.name);
    }
    if (original instanceof source.defaultView!.HTMLInputElement && copy instanceof target.defaultView!.HTMLInputElement) {
      copy.value = original.value;
      copy.checked = original.checked;
    }
    if (original instanceof source.defaultView!.HTMLTextAreaElement && copy instanceof target.defaultView!.HTMLTextAreaElement)
      copy.value = original.value;
  }
  root.querySelectorAll('script, iframe, object, embed, meta[http-equiv="refresh"]').forEach((node) => node.remove());
  const styles = target.createElement('style');
  styles.textContent = [...source.styleSheets].map((sheet) => [...sheet.cssRules].map((rule) => rule.cssText).join('\n')).join('\n');
  root.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => node.remove());
  root.querySelector('head')?.append(styles);
  target.replaceChild(root, target.documentElement);
  for (const [index, original] of originals.entries()) {
    const copy = copies[index];
    if (!copy?.isConnected) continue;
    copy.scrollTop = original.scrollTop;
    copy.scrollLeft = original.scrollLeft;
    if (original instanceof source.defaultView!.HTMLImageElement && copy instanceof target.defaultView!.HTMLImageElement
      && original.src.startsWith('blob:') && original.complete && original.naturalWidth) {
      const canvas = target.createElement('canvas');
      canvas.width = original.naturalWidth;
      canvas.height = original.naturalHeight;
      canvas.getContext('2d')?.drawImage(original, 0, 0);
      copy.src = canvas.toDataURL();
      bitmaps.push(copy);
    }
  }
  target.defaultView?.scrollTo(source.defaultView?.scrollX ?? 0, source.defaultView?.scrollY ?? 0);
  await Promise.all(bitmaps.map(bitmap => bitmap.decode?.()));
}

function copyCanvas(original: HTMLCanvasElement, copy: Element, source: Window, target: Document) {
  const bitmap = target.createElement('img');
  for (const attribute of [...copy.attributes]) {
    if (!attribute.name.startsWith('on')) bitmap.setAttribute(attribute.name, attribute.value);
  }
  const style = source.getComputedStyle(original);
  bitmap.style.cssText = Array.from(style).map(name => `${name}:${style.getPropertyValue(name)}`).join(';');
  bitmap.src = original.toDataURL();
  copy.replaceWith(bitmap);
  return bitmap;
}
