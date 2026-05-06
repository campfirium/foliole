// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { runCli } from './check-ui-copy-guard.mjs';

const tempDirs = [];

async function createFixtureRoot(files) {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'ui-copy-guard-'));
  tempDirs.push(fixtureRoot);

  for (const [relativePath, contents] of Object.entries(files)) {
    const targetPath = path.join(fixtureRoot, relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, contents, 'utf8');
  }

  return fixtureRoot;
}

function createWritableBuffer() {
  const chunks = [];
  return {
    chunks,
    write(chunk) {
      chunks.push(String(chunk));
      return true;
    }
  };
}

afterAll(async () => {
  await Promise.all(tempDirs.map((dirPath) => rm(dirPath, { recursive: true, force: true })));
});

describe('check-ui-copy-guard', () => {
  it('passes clean runtime UI copy', async () => {
    const fixtureRoot = await createFixtureRoot({
      'src/app/components/EmptyState.tsx': `
        export function EmptyState() {
          return (
            <section aria-label="Folder details">
              <h2>Inbox</h2>
              <p>No topics in this folder</p>
              <p>Review queue</p>
              <p>Review item</p>
            </section>
          );
        }
      `
    });
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const cliResult = runCli({ repoRoot: fixtureRoot, stderr, stdout });

    expect(cliResult.exitCode).toBe(0);
    expect(stdout.chunks.join('')).toContain('status: OK');
    expect(stderr.chunks.join('')).toBe('');
  });

  it('warns on banned user-facing terminology, product object drift, and Chinese UI copy', async () => {
    const fixtureRoot = await createFixtureRoot({
      'src/app/components/EmptyState.tsx': `
        export function EmptyState() {
          return (
            <section title="Node details">
              <p>Direct children will appear here</p>
              <p>No notes in this folder</p>
              <p>Recent entries</p>
            </section>
          );
        }
      `,
      'src/features/nodes/components/Menu.tsx': `
        export function Menu() {
          window.alert('合并失败。');
          return <button aria-label="Open child node">Open</button>;
        }
      `
    });
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const cliResult = runCli({ repoRoot: fixtureRoot, stderr, stdout });
    const output = `${stdout.chunks.join('')}${stderr.chunks.join('')}`;

    expect(cliResult.exitCode).toBe(0);
    expect(output).toContain('status: WARNING');
    expect(output).toContain('next step:');
    expect(output).toContain('1. Read .lab/specs/_product/terminology-and-copy.md.');
    expect(output).toContain('approved product terms:');
    expect(output).toContain('Do not mechanically replace matched words');
    expect(output).toContain('EmptyState.tsx:4 internal-structure-term "Node details"');
    expect(output).toContain('EmptyState.tsx:5 internal-structure-term "Direct children will appear here"');
    expect(output).toContain('EmptyState.tsx:6 product-object-term "No notes in this folder"');
    expect(output).toContain('EmptyState.tsx:7 product-object-term "Recent entries"');
    expect(output).toContain('Menu.tsx:3 non-english-copy "合并失败。"');
    expect(output).toContain('Menu.tsx:4 internal-structure-term "Open child node"');
  });

  it('fails only in strict mode', async () => {
    const fixtureRoot = await createFixtureRoot({
      'src/app/components/EmptyState.tsx': `
        export function EmptyState() {
          return <p>Child nodes</p>;
        }
      `
    });
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const cliResult = runCli({ repoRoot: fixtureRoot, strict: true, stderr, stdout });

    expect(cliResult.exitCode).toBe(1);
  });
});
