// @vitest-environment node
/* global process */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { URL } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';

let directory;
let javaBinary;
beforeAll(() => {
  const root = path.resolve('android/app/src/main/java/com/foliole/android');
  const plugin = fs.readFileSync(path.join(root, 'FolioleCompanionSyncPlugin.java'), 'utf8');
  const method = name => {
    const start = plugin.indexOf(`@PluginMethod public void ${name}(`);
    expect(start).toBeGreaterThan(0);
    return plugin.slice(start, plugin.indexOf('@PluginMethod', start + 1)).trim();
  };
  const helper = plugin.match(/private void async\([\s\S]*?\n {4}\}/u)?.[0];
  const fields = plugin.match(/private final ExecutorService [^;]+;/gu)?.join('\n');
  const source = fs.readFileSync(new URL('./fixtures/sync-signing-concurrency.java.template', import.meta.url), 'utf8')
    .replace('__EXECUTORS__', fields).replace('__ASYNC_HELPER__', helper)
    .replace('__MAINTENANCE__', method('maintainAttachmentFiles'))
    .replace('__SIGNING__', method('signCompanionSyncRequest'));
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-signing-concurrency-'));
  const home = process.env.JAVA_HOME ?? (process.platform === 'darwin'
    ? '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home' : null);
  const binary = name => home ? path.join(home, 'bin', name) : name;
  const fixture = path.join(directory, 'SigningFixture.java');
  fs.writeFileSync(fixture, source);
  const compiled = spawnSync(binary('javac'), ['-d', directory,
    fixture, path.join(root, 'FolioleCompanionPluginErrors.java')], { encoding: 'utf8', timeout: 30000 });
  expect(compiled.error ?? compiled.stderr).toBe('');
  expect(compiled.status).toBe(0);
  javaBinary = binary('java');
});
afterAll(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

it('allows writer-owned file maintenance to finish while signing waits for a credential read', () => {
  const result = spawnSync(javaBinary, ['-cp', directory,
    'com.foliole.android.SigningFixture'], { encoding: 'utf8', timeout: 5000 });
  expect(result.error, JSON.stringify({ signal: result.signal, stdout: result.stdout, stderr: result.stderr })).toBeUndefined();
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('Maintenance and authenticated signing both finish');
});
