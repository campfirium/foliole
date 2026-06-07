import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const BRAND_ICON_PATH = join(process.cwd(), 'assets', 'brand', 'foliole-leaf-tight.svg');

let cachedBrandIconUrl: string | null | undefined;

function readBrandIconUrl() {
  if (cachedBrandIconUrl !== undefined) {
    return cachedBrandIconUrl;
  }
  try {
    cachedBrandIconUrl = `data:image/svg+xml;base64,${readFileSync(BRAND_ICON_PATH).toString('base64')}`;
  } catch {
    cachedBrandIconUrl = null;
  }
  return cachedBrandIconUrl;
}

export function buildBrandMarkHtml() {
  const iconUrl = readBrandIconUrl();
  if (!iconUrl) {
    return '<span class="brand-fallback"></span>';
  }
  return `<img alt="" aria-hidden="true" src="${iconUrl}">`;
}
