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
