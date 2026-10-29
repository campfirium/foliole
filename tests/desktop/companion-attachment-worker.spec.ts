import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('loads the companion attachment parser as a real Chromium Web Worker and reports invalid input', async ({ desktopApp, desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  const input = await desktopApp.evaluate(() => {
    const pathApi = process.getBuiltinModule('path')!;
    const fs = process.getBuiltinModule('fs')!;
    const crypto = process.getBuiltinModule('crypto')!;
    const url = process.getBuiltinModule('url')!;
    const directory = pathApi.resolve('dist/companion/assets');
    const asset = fs.readdirSync(directory).find(name => /^attachmentReferenceParser.worker-.*\.js$/.test(name));
    if (!asset) throw new Error('Companion build required');
    const key = `${'a'.repeat(64)}.png`;
    const content = `![image](asset://${key}) ${'paragraph '.repeat(820)}`;
    return { workerUrl: url.pathToFileURL(pathApi.join(directory, asset)).href, key, content,
      hash: crypto.createHash('sha256').update(content).digest('hex'), pdf: `${'b'.repeat(64)}.pdf` };
  });
  const result = await page.evaluate(async input => {
    const worker = new Worker(input.workerUrl, { type: 'module' });
    const send = (rows: unknown[]) => new Promise<{ results?: { id: string; storageKeys: string[] }[]; error?: string }>((resolve, reject) => {
      worker.onmessage = event => resolve(event.data);
      worker.onerror = event => reject(new Error(event.message));
      worker.postMessage(rows);
    });
    let ticks = 0;
    const timer = setInterval(() => ticks++, 1);
    try {
      const valid = await send(Array.from({ length: 200 }, (_, i) => ({ id: String(i), content: input.content,
        body_hash: input.hash, resources_json: JSON.stringify([{ storage_key: input.pdf, role: 'reference', original_name: null }]) })));
      const invalid = await send([{ id: 'invalid', content: 'Different body', body_hash: input.hash, resources_json: '[]' }]);
      return { validCount: valid.results?.length, keys: valid.results?.[0]?.storageKeys.sort(), invalid: invalid.error, ticks };
    } finally { clearInterval(timer); worker.terminate(); }
  }, input);
  expect(result).toMatchObject({ validCount: 200, keys: [input.key, input.pdf], invalid: 'attachment_scan_body_hash_mismatch' });
  expect(result.ticks).toBeGreaterThan(0);
});
