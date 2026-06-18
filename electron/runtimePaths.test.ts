// @vitest-environment node

import path from 'node:path';

import { expect, it } from 'vitest';

import { resolvePreloadScriptPath, resolveRendererIndexPath } from './runtimePaths.js';

function createExistsSync(paths: string[]) {
  const normalized = new Set(paths.map((filePath) => path.normalize(filePath)));
  return (filePath: string) => normalized.has(path.normalize(filePath));
}

it('prefers source preload when runtime main lives under dist/electron', () => {
  const runtimeDir = path.join('C:', 'dev', 'foliole', 'dist', 'electron');
  const sourcePreload = path.join('C:', 'dev', 'foliole', 'electron', 'preload.cjs');

  expect(resolvePreloadScriptPath(runtimeDir, createExistsSync([sourcePreload]))).toBe(sourcePreload);
});

it('does not fall back to historical compiled preload paths', () => {
  const runtimeDir = path.join('C:', 'dev', 'foliole', 'dist', 'electron');
  const compiledPreload = path.join('C:', 'dev', 'foliole', 'dist', 'preload.cjs');
  const sourcePreload = path.join('C:', 'dev', 'foliole', 'electron', 'preload.cjs');

  expect(resolvePreloadScriptPath(runtimeDir, createExistsSync([compiledPreload]))).toBe(sourcePreload);
});

it('resolves packaged renderer index from repo dist for dist/electron output', () => {
  const runtimeDir = path.join('C:', 'dev', 'foliole', 'dist', 'electron');
  const rendererIndex = path.join('C:', 'dev', 'foliole', 'dist', 'desktop', 'index.html');

  expect(resolveRendererIndexPath(runtimeDir, createExistsSync([rendererIndex]))).toBe(rendererIndex);
});
