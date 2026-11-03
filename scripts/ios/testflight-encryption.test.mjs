// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('iOS export compliance metadata', () => {
  it.each(['App', 'ShareExtension'])('declares the established documentation exemption in %s', (target) => {
    const plist = readFileSync(`ios/App/${target}/Info.plist`);
    const metadata = JSON.parse(execFileSync('python3', ['-c',
      'import json, plistlib, sys; print(json.dumps(plistlib.loads(sys.stdin.buffer.read())))'
    ], { input: plist, encoding: 'utf8' }));
    expect(metadata.ITSAppUsesNonExemptEncryption).toBe(false);
  });
});
