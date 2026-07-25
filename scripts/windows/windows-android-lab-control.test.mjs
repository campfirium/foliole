// @vitest-environment node

import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAndroidLabControlArgs, remoteAndroidLabPaths } from './windows-android-lab-control.mjs';

describe('Windows Android lab Mac controller', () => {
  it('uses a second SSH key and Android lab dispatcher', () => {
    const remote = remoteAndroidLabPaths('WORKGROUP\\tester@windows-host', {}, '/Users/tester');
    expect(remote.dispatcher).toContain('windows-android-lab/windows-android-lab-dispatcher.mjs');
    expect(remote.node).toContain('windows-android-lab/runtime/node.exe');
    expect(remote.sshKey).toBe(path.join('/Users/tester', '.ssh', 'agent', 'foliole-windows-android-lab'));
  });

  it('parses a binary evidence output without changing the remote command', () => {
    expect(parseAndroidLabControlArgs([
      '--host', 'tester@windows-host', '--output', '.tmp/screenshot.png', 'collect', 'get', 'screenshot.png'
    ], {})).toEqual({
      command: ['collect', 'get', 'screenshot.png'], host: 'tester@windows-host', output: '.tmp/screenshot.png'
    });
  });
});
