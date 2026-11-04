// @vitest-environment node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { restorePlayCheckpoints } from './play-checkpoints.mjs';

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function fixture(phases) {
  const parent = path.resolve('.tmp/artifacts/T251-13'); fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'checkpoint-')); roots.push(root);
  const archives = new Map();
  const artifacts = phases.map(([attempt, phase, state], index) => {
    const source = path.join(root, String(index)); fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'candidate.json'), JSON.stringify(state));
    if (phase === 'signed') fs.writeFileSync(path.join(source, 'app-release-signed.aab'), 'original bytes');
    const zip = path.join(root, `${index}.zip`);
    execFileSync('zip', ['-j', zip, ...fs.readdirSync(source).map(file => path.join(source, file))]);
    archives.set(index + 1, fs.readFileSync(zip));
    return { id: index + 1, name: `android-play-42-${attempt}-${phase}`, expired: false };
  });
  const calls = [];
  const run = (bin, args, options) => {
    calls.push({ bin, args });
    if (bin !== 'gh') return execFileSync(bin, args, options);
    if (args[1].endsWith('/zip')) return archives.get(Number(args[1].split('/').at(-2)));
    return JSON.stringify({ artifacts, total_count: artifacts.length });
  };
  return { root, artifacts, run, calls, directory: path.join(root, 'restored') };
}

it('restores the immutable signed bytes with the newest attempted operation, not a rebuilt package', () => {
  const f = fixture([[1, 'signed', { phase: 'signed' }], [1, 'observed', { phase: 'upload-unknown' }],
    [2, 'uploaded', { phase: 'uploaded' }], [2, 'observed', { phase: 'commit-unknown' }]]);
  expect(restorePlayCheckpoints({ repository: 'owner/repo', runId: '42', ...f })).toBe(true);
  expect(JSON.parse(fs.readFileSync(path.join(f.directory, 'candidate.json'))).phase).toBe('commit-unknown');
  expect(fs.readFileSync(path.join(f.directory, 'app-release-signed.aab'), 'utf8')).toBe('original bytes');
  expect(fs.readFileSync(path.join(f.directory, 'restored'), 'utf8')).toBe('upload-may-have-started');
});

it('allows recovery of a pre-build failure without falsely calling it an uncertain upload', () => {
  const f = fixture([[1, 'prepared', { phase: 'prepared' }], [1, 'observed', { phase: 'prepared' }]]);
  restorePlayCheckpoints({ repository: 'owner/repo', runId: '42', ...f });
  expect(fs.readFileSync(path.join(f.directory, 'restored'), 'utf8')).toBe('no-upload');
});

it('fails closed when the original checkpoint expired and ignores artifacts from other runs', () => {
  const f = fixture([[1, 'signed', {}]]);
  f.artifacts[0].expired = true;
  expect(() => restorePlayCheckpoints({ repository: 'owner/repo', runId: '42', ...f })).toThrow(/expired/u);
  f.artifacts[0].name = 'android-play-43-1-signed';
  expect(restorePlayCheckpoints({ repository: 'owner/repo', runId: '42', ...f })).toBe(false);
  expect(f.calls.some(call => call.bin === 'unzip')).toBe(false);
});
