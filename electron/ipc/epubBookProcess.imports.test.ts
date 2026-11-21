// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Follows every runtime import of a source module; type-only imports are erased from the compiled worker. */
function runtimeImportChains(entry: string) {
  const parents = new Map<string, string | null>([[entry, null]]);
  const pending = [entry];
  const reached: string[][] = [];
  while (pending.length) {
    const file = pending.shift()!;
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/^(?:import|export)(?!\s+type\b)[^;]*?from\s*'([^']+)'/gms)) {
      const specifier = match[1]!;
      if (!specifier.startsWith('.')) {
        if (specifier === 'electron') {
          const chain = [];
          for (let at: string | null = file; at; at = parents.get(at) ?? null) chain.unshift(path.relative(root, at));
          reached.push(chain);
        }
        continue;
      }
      const target = path.resolve(path.dirname(file), specifier).replace(/\.js$/, '.ts');
      if (!parents.has(target)) { parents.set(target, file); pending.push(target); }
    }
  }
  return reached;
}

it('keeps Electron out of the EPUB parse process, which runs as plain Node', () => {
  expect(runtimeImportChains(path.join(root, 'electron/ipc/epubBookProcess.ts'))).toEqual([]);
});
