// @vitest-environment node

import { expect, it } from 'vitest';

import { createNpmCommand } from './windows-preview-native-runtime.mjs';

it('runs npm through npm-cli.js on Windows without a shell', () => {
  expect(createNpmCommand(['ls'], {}, 'win32', 'C:\\Tools\\nodejs\\node.exe')).toEqual({
    args: ['C:\\Tools\\nodejs\\node_modules\\npm\\bin\\npm-cli.js', 'ls'],
    command: 'C:\\Tools\\nodejs\\node.exe'
  });
});

it('uses npm directly on non-Windows platforms without npm_execpath', () => {
  expect(createNpmCommand(['ls'], {}, 'linux', '/usr/bin/node')).toEqual({
    args: ['ls'],
    command: 'npm'
  });
});

it('prefers npm_execpath when running inside an npm script', () => {
  expect(createNpmCommand(['run', 'check'], { npm_execpath: '/npm/cli.js' }, 'win32', 'C:\\node.exe')).toEqual({
    args: ['/npm/cli.js', 'run', 'check'],
    command: 'C:\\node.exe'
  });
});
