// @vitest-environment node

import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { collectLabEvidence, isAndroidLabRunId } from './windows-android-lab-evidence.mjs';
import { androidLabPaths } from './windows-android-lab-state.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

describe('Windows Android lab evidence', () => {
  it('reads an allowlisted file from an older internal run', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-evidence-'));
    roots.push(root);
    const paths = androidLabPaths(root);
    const runId = '1000-aaaaaaaaaaaa';
    const evidenceRoot = path.join(paths.evidence, runId);
    fs.mkdirSync(evidenceRoot, { recursive: true });
    fs.writeFileSync(path.join(evidenceRoot, 'summary.json'), '{"ok":true}\n');
    const chunks = [];
    const listed = collectLabEvidence({ operation: 'list', runId }, paths, null, { write: () => {} });
    collectLabEvidence({ operation: 'get', relativePath: 'summary.json', runId }, paths, null, { write: (value) => chunks.push(value) });
    expect(listed.files).toEqual(['summary.json']);
    expect(Buffer.concat(chunks).toString('utf8')).toContain('"ok":true');
  });

  it('rejects unknown runs, traversal-shaped ids, and non-allowlisted files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-evidence-reject-'));
    roots.push(root);
    const paths = androidLabPaths(root);
    expect(isAndroidLabRunId('1000-aaaaaaaaaaaa')).toBe(true);
    expect(isAndroidLabRunId('1000-aaaaaaaaaaaa-prepare')).toBe(true);
    expect(isAndroidLabRunId('../1000-aaaaaaaaaaaa')).toBe(false);
    expect(isAndroidLabRunId('1000-aaaaaaaaaaaa-inspect')).toBe(false);
    expect(() => collectLabEvidence({ operation: 'list', runId: '1000-aaaaaaaaaaaa' }, paths, null, { write: () => {} }))
      .toThrow('run is unavailable');
    expect(() => collectLabEvidence({ operation: 'get', relativePath: '../config.json' }, paths, { evidenceRoot: root }, { write: () => {} }))
      .toThrow('not allowed');
  });

  it('allows run-scoped UI receipts, semantic summaries, and screenshots', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-ui-evidence-'));
    roots.push(root);
    const paths = androidLabPaths(root);
    const runId = '1001-bbbbbbbbbbbb';
    const evidenceRoot = path.join(paths.evidence, runId);
    fs.mkdirSync(evidenceRoot, { recursive: true });
    for (const name of ['action-receipt.json', 'before.png', 'after.png', 'semantic-snapshot.json', 'ui-command-audit.json']) {
      fs.writeFileSync(path.join(evidenceRoot, name), name);
    }
    expect(collectLabEvidence({ operation: 'list', runId }, paths, null, { write: () => {} }).files)
      .toEqual(['action-receipt.json', 'after.png', 'before.png', 'semantic-snapshot.json', 'ui-command-audit.json']);
  });

  it('lists and reads scenario child evidence without allowing traversal', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-scenario-evidence-'));
    roots.push(root);
    const paths = androidLabPaths(root);
    const runId = '1002-cccccccccccc-scenario';
    const evidenceRoot = path.join(paths.evidence, runId, 'ui-reveal');
    fs.mkdirSync(evidenceRoot, { recursive: true });
    fs.writeFileSync(path.join(evidenceRoot, 'action-receipt.json'), '{"ok":true}\n');
    fs.writeFileSync(path.join(evidenceRoot, 'private.txt'), 'nope');
    const chunks = [];
    const listed = collectLabEvidence({ operation: 'list', runId }, paths, null, { write: () => {} });
    collectLabEvidence({ operation: 'get', relativePath: 'ui-reveal/action-receipt.json', runId }, paths, null, {
      write: (value) => chunks.push(value)
    });
    expect(listed.files).toEqual(['ui-reveal/action-receipt.json']);
    expect(Buffer.concat(chunks).toString('utf8')).toContain('"ok":true');
    expect(() => collectLabEvidence({ operation: 'get', relativePath: 'ui-reveal/private.txt', runId }, paths, null, { write: () => {} }))
      .toThrow('not allowed');
    expect(() => collectLabEvidence({ operation: 'get', relativePath: '../summary.json', runId }, paths, null, { write: () => {} }))
      .toThrow('not allowed');
  });
});
