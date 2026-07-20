// @vitest-environment node

import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  iosResourceCommand,
  iosSwiftResourceArgs,
  iosVitestResourceArgs,
  iosXcodebuildResourceArgs,
  resolveIosResourceMode
} from './ios-resource-profile.mjs';

describe('iOS resource profile', () => {
  it('defaults command-line iOS work to the background profile', () => {
    expect(resolveIosResourceMode({})).toBe('background');
    expect(iosXcodebuildResourceArgs('background')).toEqual(['-jobs', '2']);
    expect(iosSwiftResourceArgs('background')).toEqual(['--jobs', '2']);
    expect(iosVitestResourceArgs('background')).toEqual(['--maxWorkers=2', '--no-file-parallelism']);
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
    expect(scripts['quality:ios']).toContain('ios-bootstrap-acceptance.mjs');
    expect(scripts['quality:ios:full']).toBe('FOLIOLE_IOS_RESOURCE_MODE=full npm run quality:ios');
  });
});
