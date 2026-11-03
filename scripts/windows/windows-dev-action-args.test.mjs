// @vitest-environment node

import { expect, it } from 'vitest';

import { parseWindowsDevActionArgs } from './windows-dev-action-args.mjs';

it('parses an action without assigning a maintainer machine', () => {
  expect(parseWindowsDevActionArgs(['verify'])).toEqual({ action: 'verify', host: undefined });
});

it('preserves an explicitly selected host and lets the CLI override the caller environment', () => {
  expect(parseWindowsDevActionArgs(['--host', 'caller@windows.example', 'verify'], {
    FOLIOLE_WINDOWS_DEV_SSH: 'other@windows.example'
  })).toEqual({ action: 'verify', host: 'caller@windows.example' });
});

it.each([['--host'], ['--host', '', 'verify'], ['--host', 'bad host', 'verify']])(
  'rejects an invalid explicit host in %j', (...argv) => {
    expect(() => parseWindowsDevActionArgs(argv)).toThrow('user@host');
  }
);

it('rejects unregistered actions even when no host was assigned', () => {
  expect(() => parseWindowsDevActionArgs(['unregistered'])).toThrow('registered fixed action');
});

it('keeps diagnostic mode and candidate source restrictions independent of a machine', () => {
  expect(parseWindowsDevActionArgs(['sync-sqlite-diagnostic', '--mode', 'micro']))
    .toMatchObject({ action: 'sync-sqlite-diagnostic', diagnosticMode: 'micro' });
  expect(() => parseWindowsDevActionArgs(['verify', '--source-ref', 'refs/heads/release']))
    .toThrow('only accepted for candidate preparation');
  expect(() => parseWindowsDevActionArgs(['verify', '--revision', 'a'.repeat(40)]))
    .toThrow('only accepted for Internal');
});
