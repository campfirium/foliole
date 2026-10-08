import { expect, it } from 'vitest';

import { parseNodeSnapshotArgs } from './commandParserNodeSnapshot.js';
import { parseSplitTopicArgs } from './splitTopicCommandArgs.js';

it('accepts an empty previous body and keeps the complete candidate', () => {
  const content = '中文😀'.repeat(120_000);
  expect(parseSplitTopicArgs({ disposition: 'partition-body', sourceNodeId: 'source', expectedContent: '', content }))
    .toEqual({ disposition: 'partition-body', sourceNodeId: 'source', expectedContent: '', content });
});

it('rejects missing identity and malformed body payloads', () => {
  for (const patch of [{ sourceNodeId: '' }, { content: null }, { expectedContent: 12 }]) {
    expect(() => parseSplitTopicArgs({ disposition: 'partition-body', sourceNodeId: 'source', expectedContent: '', content: 'text', ...patch }))
      .toThrow('invalid argument');
  }
});

it('rejects a normal oversized node write while keeping the explicit partition route available', () => {
  const content = 'x'.repeat(1_048_577);
  expect(() => parseNodeSnapshotArgs({ content })).toThrow('text_body_too_large');
  expect(parseSplitTopicArgs({ disposition: 'partition-body', sourceNodeId: 'source', expectedContent: '', content }).disposition)
    .toBe('partition-body');
});

it.each(['reveal'])('checks the %s byte limit at the IPC boundary', (field) => {
  const input = { nodeId: 'item', kind: 'item', isTitleManual: true,
    content: '[...]', title: 'Title', reveal: 'Answer',
    createdAt: '2026-10-09T00:00:00.000Z', updatedAt: '2026-10-09T00:00:00.000Z' };
  const exact = '中'.repeat(349_525) + 'x';
  expect(parseNodeSnapshotArgs({ ...input, [field]: exact })).toHaveProperty(field, exact);
  expect(() => parseNodeSnapshotArgs({ ...input, [field]: exact + 'x' })).toThrow(`node_text_too_large:${field}`);
});

it('allows a long title to reach authoring normalization without rewriting historical snapshots', () => {
  const title = '中'.repeat(349_526);
  expect(parseNodeSnapshotArgs({ nodeId: 'item', kind: 'item', isTitleManual: true,
    content: 'Body', title, createdAt: '2026-10-09T00:00:00.000Z', updatedAt: '2026-10-09T00:00:00.000Z' }).title)
    .toBe(title);
});
