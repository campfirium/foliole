// jsdom applies no stylesheet, so the body boundary is resolved here from the real reading stylesheet:
// the `top` and `bottom` the surface would get, with a non-zero safe area so that losing it shows.
// Vitest empties stylesheet imports, so the file is read from disk.
import { readFileSync } from 'node:fs';

const SAFE_AREA: Record<string, string> = { 'safe-area-inset-top': '24px', 'safe-area-inset-bottom': '16px' };

/** The boundaries the table expects, as `top/bottom` px. Docked adds the toolbar bands to the safe area. */
export const BODY = { article: '72/72', flow: '116/80', floating: '24/16' };

const styles = readFileSync('src/companion/companionReadingDisplay.css', 'utf8');
const rules = [...styles.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*\s*\}/g, '')
  .matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector!.trim(), body: body! }))
  .filter(rule => rule.selector.startsWith('section[data-reading-body') && !rule.selector.includes('::'));

// The stylesheet orders these rules by rising specificity, so a later match wins.
function declarations(surface: Element) {
  // Declared on :root in companionMinimal.css.
  const result: Record<string, string> = { '--companion-page-content-gap': '8px' };
  for (const rule of rules.filter(candidate => surface.matches(candidate.selector))) {
    for (const declaration of rule.body.split(';')) {
      const colon = declaration.indexOf(':');
      if (colon > 0) result[declaration.slice(0, colon).trim()] = declaration.slice(colon + 1).trim();
    }
  }
  return result;
}

function pixels(value: string, properties: Record<string, string>): number {
  let expression = value.replace(/env\(([\w-]+),\s*[^()]*\)/g, (_, name: string) => SAFE_AREA[name] ?? '0px');
  const reference = /var\((--[\w-]+)(?:,\s*([^()]*))?\)/;
  for (let match = reference.exec(expression); match; match = reference.exec(expression)) {
    const resolved = properties[match[1]!] ?? match[2];
    if (resolved === undefined) throw new Error(`Unresolved ${match[1]}`);
    expression = expression.replace(match[0], `(${resolved.replace(/env\(([\w-]+),\s*[^()]*\)/g,
      (_, name: string) => SAFE_AREA[name] ?? '0px')})`);
  }
  expression = expression.replace(/([\d.]+)rem/g, (_, n: string) => `${Number(n) * 16}`).replace(/([\d.]+)px/g, '$1')
    .replace(/calc/g, '').replace(/max/g, 'Math.max');
  if (!/^[\d\s.+\-*/(),Mathmax]+$/.test(expression)) throw new Error(`Unresolvable boundary: ${value}`);
  return Number(new Function(`return ${expression};`)());
}

/** Null while no surface has a reading body, as during editing. */
export function bodyBoundary() {
  const surface = document.querySelector('section[data-reading-body]');
  if (!surface) return null;
  const properties = declarations(surface);
  return `${pixels(properties.top!, properties)}/${pixels(properties.bottom!, properties)}`;
}
