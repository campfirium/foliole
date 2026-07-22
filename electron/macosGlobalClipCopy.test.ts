// @vitest-environment node

import { expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/Applications/Foliole.app/Contents/MacOS/Foliole'),
    isPackaged: true
  }
}));

import {
  parseMacosGlobalClipResult,
  resolveMacosGlobalClipHelperPath,
  runMacosGlobalClipCopy
} from './macosGlobalClipCopy.js';

it('resolves the Foliole-branded sibling helper', () => {
  expect(resolveMacosGlobalClipHelperPath()).toBe(
    '/Applications/Foliole.app/Contents/MacOS/Foliole Global Capture'
  );
});

it('parses granted, denied, and unavailable helper results', () => {
  expect(parseMacosGlobalClipResult('{"permission":"granted","copyWritten":true}')).toEqual({
    copyWritten: true,
    permission: 'granted'
  });
  expect(parseMacosGlobalClipResult('{"permission":"denied","copyWritten":false}').permission).toBe('denied');
  expect(parseMacosGlobalClipResult('{"permission":"unavailable","copyWritten":false}').permission).toBe('unavailable');
});

it('rejects malformed helper output', () => {
  expect(() => parseMacosGlobalClipResult('{}')).toThrow(/invalid permission/);
  expect(() => parseMacosGlobalClipResult('{"permission":"granted","copyWritten":"yes"}')).toThrow(/invalid copy/);
  expect(() => parseMacosGlobalClipResult('not-json')).toThrow();
});

it('runs capture and preflight modes without reading clipboard content', async () => {
  const run = vi.fn(async (_file, args) => ({ stderr: '', stdout: JSON.stringify({
    copyWritten: args[0] === '--capture',
    permission: 'granted'
  }) }));
  await expect(runMacosGlobalClipCopy({ exists: () => true, helperPath: '/helper', platform: 'darwin', run: run as never }))
    .resolves.toEqual({ copyWritten: true, permission: 'granted' });
  await expect(runMacosGlobalClipCopy({ exists: () => true, helperPath: '/helper', mode: 'preflight', platform: 'darwin', run: run as never }))
    .resolves.toEqual({ copyWritten: false, permission: 'granted' });
  expect(run.mock.calls.map(([, args]) => args)).toEqual([['--capture'], ['--preflight']]);
});

it('fails closed when the helper is missing or exits with an error', async () => {
  await expect(runMacosGlobalClipCopy({ exists: () => false, helperPath: '/missing', platform: 'darwin' })).rejects.toThrow(/missing/);
  await expect(runMacosGlobalClipCopy({
    exists: () => true,
    helperPath: '/helper',
    platform: 'darwin',
    run: vi.fn(async () => { throw new Error('exit 1'); }) as never
  })).rejects.toThrow('exit 1');
});
