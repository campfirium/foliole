// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import {
  assertExternalPackageOutput, publishArtifactBatch, withTemporaryPackageOutput
} from './package-artifact-lifecycle.mjs';

const fixtureRoots = [];

function makeFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'foliole-artifact-test-'));
  fixtureRoots.push(root);
  const sourceDirectory = path.join(root, 'source');
  const targetDirectory = path.join(root, 'artifacts/channel');
  mkdirSync(sourceDirectory, { recursive: true });
  return { root, sourceDirectory, targetDirectory };
}

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

it('rejects expanded package output inside the repository', () => {
  expect(assertExternalPackageOutput('/repo', '/system-temp/package')).toBe('/system-temp/package');
  expect(() => assertExternalPackageOutput('/repo', '/repo/artifacts/macos')).toThrow('outside the repository');
  expect(() => assertExternalPackageOutput('/repo', 'relative-output')).toThrow('absolute external path');
});

it('cleans the temporary package output after success and failure', async () => {
  const removed = [];
  const options = {
    makeTempDirectory: async () => '/system-temp/package',
    remove: async (target) => removed.push(target)
  };

  await expect(withTemporaryPackageOutput(async () => 'done', options)).resolves.toBe('done');
  await expect(withTemporaryPackageOutput(async () => { throw new Error('build failed'); }, options))
    .rejects.toThrow('build failed');
  expect(removed).toEqual(['/system-temp/package', '/system-temp/package']);
});

it('publishes only the exact formal artifact list', async () => {
  const fixture = makeFixture();
  writeFileSync(path.join(fixture.sourceDirectory, 'Foliole.dmg'), 'formal');
  writeFileSync(path.join(fixture.sourceDirectory, 'builder-debug.yml'), 'debug');

  await publishArtifactBatch({ ...fixture, names: ['Foliole.dmg'] });

  expect(readFileSync(path.join(fixture.targetDirectory, 'Foliole.dmg'), 'utf8')).toBe('formal');
  expect(existsSync(path.join(fixture.targetDirectory, 'builder-debug.yml'))).toBe(false);
});

it('keeps the previous formal batch when publication fails', async () => {
  const fixture = makeFixture();
  mkdirSync(fixture.targetDirectory, { recursive: true });
  writeFileSync(path.join(fixture.targetDirectory, 'previous.pkg'), 'previous');
  writeFileSync(path.join(fixture.sourceDirectory, 'next.pkg'), 'next');
  let moveCount = 0;
  const move = vi.fn(async (source, target) => {
    moveCount += 1;
    if (moveCount === 2) throw new Error('publish failed');
    return (await import('node:fs/promises')).rename(source, target);
  });

  await expect(publishArtifactBatch(
    { ...fixture, names: ['next.pkg'] },
    { move }
  )).rejects.toThrow('publish failed');

  expect(readFileSync(path.join(fixture.targetDirectory, 'previous.pkg'), 'utf8')).toBe('previous');
  expect(existsSync(path.join(fixture.targetDirectory, 'next.pkg'))).toBe(false);
});

it('rejects app bundles and cross-device publication staging', async () => {
  const fixture = makeFixture();
  await expect(publishArtifactBatch({ ...fixture, names: ['Foliole.app'] }))
    .rejects.toThrow('Invalid formal artifact name');
  writeFileSync(path.join(fixture.sourceDirectory, 'Foliole.pkg'), 'formal');
  const getStat = vi.fn()
    .mockResolvedValueOnce({ dev: 1 })
    .mockResolvedValueOnce({ dev: 2 });

  await expect(publishArtifactBatch(
    { ...fixture, names: ['Foliole.pkg'] },
    { getStat }
  )).rejects.toThrow('target filesystem');
  expect(existsSync(fixture.targetDirectory)).toBe(false);
});
