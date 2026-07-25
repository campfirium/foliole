// @vitest-environment node

import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { androidLabSshArgs, parseAndroidLabControlArgs, remoteAndroidLabPaths } from './windows-android-lab-control.mjs';

describe('Windows Android lab Mac controller', () => {
  it('uses a second SSH key and Android lab dispatcher', () => {
    const remote = remoteAndroidLabPaths({}, '/Users/tester');
    expect(remote.sshKey).toBe(path.join('/Users/tester', '.ssh', 'agent', 'foliole-windows-android-lab'));
  });

  it('parses a binary evidence output without changing the remote command', () => {
    expect(parseAndroidLabControlArgs([
      '--host', 'tester@windows-host', '--output', '.tmp/screenshot.png', 'collect', 'get', 'screenshot.png'
    ], {})).toEqual({
      command: ['collect', 'get', 'screenshot.png'], host: 'tester@windows-host', output: '.tmp/screenshot.png'
    });
  });

  it('requires an explicit SSH user and sends only action tokens', () => {
    expect(() => parseAndroidLabControlArgs(['--host', 'windows-host', 'status'], {})).toThrow();
    expect(parseAndroidLabControlArgs(['--host', 'tester@windows-host', 'device', 'status'], {}).command).toEqual(['device', 'status']);
    const args = androidLabSshArgs('tester@windows-host', ['device', 'status'], {}, '/Users/tester');
    expect(args.slice(-3)).toEqual(['tester@windows-host', 'device', 'status']);
    expect(args.join(' ')).not.toMatch(/node\.exe|dispatcher/iu);
  });
});
