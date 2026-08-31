// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

import { createT152DesktopDnsSdLibrary } from './t152-desktop-dnssd-library.mjs';

it('creates a unique real library outside source and evidence roots', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 't152-dnssd-')));
  const result = createT152DesktopDnsSdLibrary({
    attemptId: '11111111-1111-4111-8111-111111111111',
    baseRoot: path.join(root, 'short'), evidenceRoot: path.join(root, 'evidence'),
    sourceRoot: path.join(root, 'source')
  });
  expect(fs.realpathSync(result.libraryHome)).toBe(result.libraryHome);
  expect(result.libraryHome.startsWith(path.join(root, 'short'))).toBe(true);
  expect(() => createT152DesktopDnsSdLibrary({
    attemptId: '11111111-1111-4111-8111-111111111111',
    baseRoot: path.join(root, 'short'), evidenceRoot: path.join(root, 'evidence'),
    sourceRoot: path.join(root, 'source')
  })).toThrow();
});

it('rejects a library base nested under evidence', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 't152-dnssd-')));
  expect(() => createT152DesktopDnsSdLibrary({
    attemptId: '22222222-2222-4222-8222-222222222222',
    baseRoot: path.join(root, 'evidence', 'library'), evidenceRoot: path.join(root, 'evidence'),
    sourceRoot: path.join(root, 'source')
  })).toThrow('outside source and evidence roots');
});
