// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  iosResourceCommand,
  iosSqliteVitestEnv,
  iosSwiftResourceArgs,
  iosVitestResourceArgs,
  iosXcodebuildResourceArgs,
  resolveIosResourceMode
} from './ios-resource-profile.mjs';

describe('iOS resource profile', () => {
  it('lists every iOS script test exactly once in the runtime contract runner', () => {
    const source = fs.readFileSync('scripts/ios/ios-runtime-contract-tests.mjs', 'utf8');
    const listed = [...source.matchAll(/'((?:scripts\/ios\/)[^']+\.test\.mjs)'/gu)]
      .map((match) => match[1]);
    const existing = fs.readdirSync('scripts/ios', { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.test.mjs'))
      .map((entry) => path.posix.join('scripts/ios', entry.name))
      .sort();

    expect([...new Set(listed)].sort()).toEqual(existing);
    expect(listed).toHaveLength(new Set(listed).size);
  });

  it('defaults command-line iOS work to the background profile', () => {
    expect(resolveIosResourceMode({})).toBe('background');
    expect(iosXcodebuildResourceArgs('background')).toEqual(['-jobs', '1']);
    expect(iosSwiftResourceArgs('background')).toEqual(['--jobs', '1']);
    expect(iosVitestResourceArgs('background')).toEqual(['--maxWorkers=1', '--no-file-parallelism']);
    expect(iosSqliteVitestEnv({ FOO: 'bar' })).toEqual({
      FOO: 'bar',
      VITEST_FILE_PARALLELISM: '0',
      VITEST_MAX_WORKERS: '1',
      VITEST_POOL: 'forks'
    });
    expect(iosResourceCommand('vite', ['build'], 'background', 'darwin')).toEqual({
      args: ['-b', 'vite', 'build'], command: '/usr/sbin/taskpolicy'
    });
    expect(iosResourceCommand('vite', ['build'], 'background', 'linux')).toEqual({
      args: ['build'], command: 'vite'
    });
  });

  it('removes scheduling limits in the explicit full profile', () => {
    expect(resolveIosResourceMode({ FOLIOLE_IOS_RESOURCE_MODE: 'full' })).toBe('full');
    expect(iosXcodebuildResourceArgs('full', { testing: true })).toEqual([]);
    expect(iosSwiftResourceArgs('full')).toEqual([]);
    expect(iosVitestResourceArgs('full')).toEqual([]);
    expect(iosResourceCommand('xcodebuild', ['build'], 'full')).toEqual({
      args: ['build'], command: 'xcodebuild'
    });
  });

  it('keeps both public quality commands on the same verification chain', () => {
    const scripts = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts;
    expect(scripts['quality:ios:contract']).toBe(
      'node scripts/quality/quality-command-contracts.mjs allow quality:ios:contract && ' +
      'node scripts/ios/ios-runtime-contract-tests.mjs'
    );
    expect(scripts['quality:ios']).toContain('npm run quality:ios:contract');
    expect(scripts['quality:ios']).toContain('npm run quality:ios:simulator');
    expect(scripts['quality:ios:simulator']).toContain('ios-bootstrap-acceptance.mjs');
    expect(scripts['quality:ios:simulator']).toContain('FOLIOLE_IOS_ACCEPTANCE_SCENARIO=content-resource-read');
    expect(scripts['quality:ios:simulator']).toContain('FOLIOLE_IOS_ACCEPTANCE_SCENARIO=state-writeback-runtime');
    expect(scripts['quality:ios:simulator']).toContain('FOLIOLE_IOS_ACCEPTANCE_SCENARIO=sync-pack-runtime');
    expect(scripts['quality:ios:simulator']).not.toContain('quality:ios:contract');
    expect(scripts['quality:ios:simulator:full']).toBe(
      'node scripts/quality/quality-command-contracts.mjs allow quality:ios:simulator:full && ' +
      'FOLIOLE_IOS_RESOURCE_MODE=full npm run quality:ios:simulator'
    );
    expect(scripts['quality:ios:full']).toBe(
      'node scripts/quality/quality-command-contracts.mjs allow quality:ios:full && ' +
      'FOLIOLE_IOS_RESOURCE_MODE=full npm run quality:ios'
    );
  });
});
