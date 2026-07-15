import { describe, expect, it } from 'vitest';
import process from 'node:process';

import packageJson from '../../package.json' with { type: 'json' };

import { resolveQualityFastCommand } from './run-quality-fast.mjs';

describe('quality fast platform adapter', () => {
  it('owns both public fast quality entries', () => {
    expect(packageJson.scripts['quality:fast']).toBe('node scripts/quality/run-quality-fast.mjs');
    expect(packageJson.scripts['quality:fast:native']).toBe('node scripts/quality/run-quality-fast.mjs');
  });

  it('routes Mac and Linux to the shared fast kernel with argv intact', () => {
    for (const platform of ['darwin', 'linux']) {
      const result = resolveQualityFastCommand(platform, ['--route-json']);
      expect(result.command).toBe('bash');
      expect(result.args.at(-1)).toBe('--route-json');
      expect(result.args[0]).toMatch(/quality-gate-fast\.sh$/u);
    }
  });

  it('routes Windows to the native T0 adapter', () => {
    const result = resolveQualityFastCommand('win32', ['--route']);
    expect(result.command).toBe(process.execPath);
    expect(result.args[0]).toMatch(/windows\/quality-fast-native\.mjs$/u);
    expect(result.args[1]).toBe('--route');
  });

  it('fails closed for an unsupported platform', () => {
    expect(() => resolveQualityFastCommand('aix', [])).toThrow('unsupported platform');
  });
});
