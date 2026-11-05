import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export function readPlayDexIdentity(file, bundle = false, run = execFileSync) {
  const entries = run('unzip', ['-Z1', file], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }).trim().split(/\r?\n/u);
  const pattern = bundle ? /^base\/dex\/(classes(?:\d+)?\.dex)$/u : /^(classes(?:\d+)?\.dex)$/u;
  const dex = entries.map(entry => ({ entry, name: entry.match(pattern)?.[1] })).filter(row => row.name);
  if (!dex.length || new Set(dex.map(row => row.name)).size !== dex.length ||
      bundle && entries.some(entry => !entry.startsWith('base/') && /\/dex\/.*\.dex$/u.test(entry))) {
    throw new Error('Expected one base module with an unambiguous DEX identity');
  }
  return Object.fromEntries(dex.sort((left, right) => left.name.localeCompare(right.name)).map(({ entry, name }) => {
    const bytes = run('unzip', ['-p', file, entry], { maxBuffer: 128 * 1024 * 1024 });
    return [name, createHash('sha256').update(bytes).digest('hex')];
  }));
}

export function verifyPlayDexIdentity(actual, expected) {
  const normalize = value => Object.entries(value ?? {}).sort(([left], [right]) => left.localeCompare(right));
  const entries = normalize(expected);
  if (!entries.length || entries.some(([name, hash]) => !/^classes(?:\d+)?\.dex$/u.test(name) || !/^[a-f\d]{64}$/u.test(hash)) ||
      JSON.stringify(normalize(actual)) !== JSON.stringify(entries)) {
    throw new Error('Generated APK executable code differs from the original AAB; do not distribute a protected or modified APK');
  }
}
