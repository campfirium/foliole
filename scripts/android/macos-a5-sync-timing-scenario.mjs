/* global setTimeout, window */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { readMacImageFact } from './macos-a5-image-content-evidence.mjs';
import { connectImageWebView, openAndroidImageTopic, showAndroidImageNavigation } from './macos-a5-image-content-ui.mjs';
import { assertTimingOverlap, observeTimingAttachments, openTimingReader, waitForTimingBody } from './macos-a5-sync-timing-observation.mjs';

async function createTopic(session, suffix) {
  const nodeId = `sync-timing-${suffix}-${randomUUID()}`;
  const workspace = await session.invoke('load_workspace_list_snapshot', { includePdfOpenings: false });
  const stamp = new Date().toISOString();
  const payload = { nodeId, activeNodeId: nodeId, anchorLink: null, content: `Sync timing ${suffix}`,
    createdAt: stamp, updatedAt: stamp, isTitleManual: true, kind: 'topic',
    nodeOrder: [...workspace.nodeOrder, nodeId], parentNodeId: 'special-inbox',
    position: workspace.nodeOrder.length, reveal: null, title: `Sync timing ${suffix}` };
  const created = await session.invoke('create_topic', payload);
  assert.ok(created.createdNodeIds.includes(nodeId));
  return payload;
}

async function seedAttachmentBacklog(session, args, direction) {
  const topic = await createTopic(session, `attachments-${direction}`);
  const seed = fs.readFileSync(path.join(args.paths.buildRoot, 'assets/brand/foliole-leaf-tight.png'));
  const references = [];
  for (let index = 0; index < 4; index++) {
    const bytes = Buffer.concat([seed, Buffer.alloc(16 * 1024 * 1024, index + (direction === 'mac-to-a5' ? 1 : 5))]);
    const imported = await session.invoke('import_clipboard_image_attachment', {
      bytesBase64: bytes.toString('base64'), mimeType: 'image/png', nodeId: topic.nodeId,
      originalName: `Timing ${direction} ${index}.png` });
    assert.equal(imported.status, 'imported');
    references.push({ storage_key: imported.storage_key, role: 'image', original_name: imported.original_name });
  }
  const base = await session.invoke('load_node_document', { nodeId: topic.nodeId });
  await session.invoke('update_node_content_with_anchors', { parent: { ...topic,
    content: references.map(value => `![Timing](asset://${value.storage_key})`).join('\n\n'),
    updatedAt: new Date().toISOString() }, affectedAnchors: [],
    edit: { baseVersionId: base.currentVersionId, versionId: randomUUID(), newImageReferences: references } });
  return { nodeId: topic.nodeId, references };
}

export async function prepareAndroidEdit(page) {
  const edit = page.getByTestId('companion-reading-edit');
  if (!await edit.isVisible()) await page.locator('[data-companion-readable-document]').click();
  await edit.click();
}

export async function replaceAndroidTimingBody(page, content) {
  const editor = page.locator('[data-companion-readable-document] .cm-content[contenteditable="true"]');
  await editor.waitFor();
  await editor.press('Control+A');
  const selection = await editor.evaluate(element => {
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    const selected = window.getSelection();
    return { selected: selected?.rangeCount ? selected.getRangeAt(0).toString() : '', body: range.toString() };
  });
  assert.equal(selection.selected, selection.body, 'timing_input_requires_full_body_selection');
  await page.keyboard.insertText(content);
  return selection;
}

async function sample({ direction, index, topic, session, page, reader, evidenceRoot, samples, save, requests }) {
  const content = `Sync timing clean text\n\n${direction} ${index} ${randomUUID()}\nFull body ends here.`;
  if (direction === 'a5-to-mac') {
    const previous = samples.at(-1);
    if (previous) await page.getByText(previous.content.split('\n')[2], { exact: true }).waitFor();
    await prepareAndroidEdit(page);
  }
  if (requests) {
    const deadline = Date.now() + 30_000;
    while (!requests.some(value => !value.endedAt) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.ok(requests.some(value => !value.endedAt), 'No attachment request in flight');
  }
  const startedAt = Date.now();
  const record = { direction, index, nodeId: topic.nodeId, startedAt, content, status: 'started',
    clock: 'controller wall clock', boundary: 'first text-input request to committed full-body readback; includes input and save latency' };
  samples.push(record); save();
  if (direction === 'mac-to-a5') {
    await session.invoke('update_node_content', { ...topic, content, updatedAt: new Date().toISOString() });
  } else {
    record.inputSelection = await replaceAndroidTimingBody(page, content);
    save();
    await page.getByTestId('companion-reading-edit-done').click();
  }
  record.saveReturnedAt = Date.now();
  const read = direction === 'mac-to-a5' ? () => reader.read(topic.nodeId) : () => readMacImageFact(evidenceRoot, topic.nodeId);
  const sourceRead = direction === 'mac-to-a5' ? () => readMacImageFact(evidenceRoot, topic.nodeId) : () => reader.read(topic.nodeId);
  record.stage = 'source-body-readback';
  const source = await waitForTimingBody(async () => {
    const fact = await sourceRead();
    record.lastSourceBody = fact?.content ?? null;
    return fact;
  }, content, { startedAt });
  record.source = source;
  record.stage = 'target-body-readback';
  Object.assign(record, await waitForTimingBody(async () => {
    const fact = await read();
    record.lastTargetBody = fact?.content ?? null;
    return fact;
  }, content, { startedAt }));
  await waitForTimingBody(() => reader.read(topic.nodeId), content, { startedAt });
  const mac = await readMacImageFact(evidenceRoot, topic.nodeId);
  assert.equal(mac.content, content);
  assert.deepEqual(JSON.parse(mac.resource_references ?? '[]'), []);
  record.macVersionCount = mac.versions;
  if (requests) record.overlap = assertTimingOverlap(requests, startedAt);
  record.status = 'passed'; save();
}

export async function runSyncTimingScenario({ args, device, evidenceRoot, session }) {
  const receipt = { status: 'running', samples: [], attachments: [], limitMs: 5000 };
  const save = () => fs.writeFileSync(path.join(evidenceRoot, 'sync-timing.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  const { page } = await connectImageWebView(args, device);
  let reader;
  let observation;
  try {
    save();
    await showAndroidImageNavigation(page, args);
    reader = await openTimingReader(page);
    const topic = await createTopic(session, 'ordinary');
    await waitForTimingBody(() => reader.read(topic.nodeId), topic.content, { limitMs: 30_000 });
    await openAndroidImageTopic(page, topic.title, topic.nodeId);
    const context = { topic, session, page, reader, evidenceRoot, samples: receipt.samples, save };
    for (let index = 1; index <= 10; index++) {
      for (const direction of ['mac-to-a5', 'a5-to-mac']) await sample({ ...context, direction, index });
    }
    observation = await observeTimingAttachments(page);
    for (const direction of ['mac-to-a5', 'a5-to-mac']) {
      receipt.attachments.push(await seedAttachmentBacklog(session, args, direction)); save();
      await sample({ ...context, direction, index: 'attachment-in-flight', requests: observation.requests });
    }
    receipt.status = 'passed';
  } catch (error) {
    receipt.status = 'failed'; receipt.error = error.message;
    const active = receipt.samples.at(-1);
    if (active?.status === 'started') { active.status = 'failed'; active.error = error.message; }
    await page.screenshot({ path: path.join(evidenceRoot, 'timing-failure.png') }).catch(() => undefined);
    fs.writeFileSync(path.join(evidenceRoot, 'timing-failure.txt'), await page.locator('body').innerText().catch(() => 'page unavailable'));
    throw error;
  }
  finally {
    receipt.requests = observation?.requests;
    try { await observation?.close(); } finally { try { await reader?.close(); } finally { save(); } }
  }
}
