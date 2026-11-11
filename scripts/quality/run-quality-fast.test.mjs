// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

import packageJson from '../../package.json' with { type: 'json' };

import { runManagedCommand } from './quality-gate-fast.test-support.mjs';
import { resolveQualityFastCommand, validateQualityFastArgs } from './run-quality-fast.mjs';

describe('quality fast platform adapter', () => {
  it('owns the single public fast quality entry', () => {
    expect(packageJson.scripts['quality:fast']).toBe('node scripts/quality/run-quality-fast.mjs');
    expect(packageJson.scripts['quality:fast:native']).toBeUndefined();
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
    expect(path.win32.normalize(result.args[0])).toMatch(/\\scripts\\windows\\quality-fast-native\.mjs$/u);
    expect(result.args[1]).toBe('--route');
  });

  it('fails closed for an unsupported platform', () => {
    expect(() => resolveQualityFastCommand('aix', [])).toThrow('unsupported platform');
  });

  it('rejects aggregate escalation arguments and mixed route modes', () => {
    expect(() => validateQualityFastArgs(['--full'])).toThrow('aggregate quality is hosted-only');
    expect(() => validateQualityFastArgs(['--release'])).toThrow('aggregate quality is hosted-only');
    expect(() => validateQualityFastArgs(['--route', '--route-json'])).toThrow('accepts only');
  });

  it.runIf(process.platform === 'darwin')('reports child RSS and preserves the fast check exit status', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'quality-fast-agent-'));
    const entry = fileURLToPath(new URL('./run-quality-fast.mjs', import.meta.url));
    try {
      await writeFile(path.join(cwd, 'package.json'), JSON.stringify({
        scripts: { 'quality:fast': 'node child.cjs' }
      }));
      await writeFile(path.join(cwd, 'child.cjs'), [
        'const memory = Buffer.alloc(128 * 1024 * 1024, 1);',
        'setTimeout(() => { console.log(memory.length); process.exitCode = 17; }, 900);'
      ].join('\n'));
      const result = await runManagedCommand(process.execPath, [entry, '--agent'], {
        cwd,
        env: {
          FOLIOLE_RESOURCE_GATE_HELD: '',
          FOLIOLE_RESOURCE_GATE_RUNTIME_DIR: path.join(cwd, 'locks'),
          QUALITY_GATE_LOG_ROOT: path.join(cwd, 'logs')
        }
      });
      expect(result.code).toBe(17);
      expect(result.stdout).toContain('134217728');
      const peak = result.stdout.match(/sampled peak RSS: (\d+) KiB/u);
      expect(Number(peak?.[1])).toBeGreaterThan(128 * 1024);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
