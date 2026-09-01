// @vitest-environment node

import { expect, it } from 'vitest';

import { readOpenAiCompatibleSse } from './openAiCompatibleSse.js';

it('assembles fragmented ordered function calls and recognizes tool-call termination', async () => {
  const frames = [
    chunk({ tool_calls: [
      { function: { arguments: '{"id":', name: 'read_material' }, id: 'call-1', index: 0, type: 'function' },
      { function: { arguments: '{"query":', name: 'search_materials' }, id: 'call-2', index: 1, type: 'function' }
    ] }),
    chunk({ tool_calls: [
      { function: { arguments: '"topic-1"}' }, index: 0 },
      { function: { arguments: '"memo"}' }, index: 1 }
    ] }, 'tool_calls'),
    'data: [DONE]'
  ];
  const result = await readOpenAiCompatibleSse(fragmentedStream(frames.join('\n\n') + '\n\n'), new AbortController(), () => undefined);

  expect(result).toEqual({
    finishReason: 'tool_calls',
    text: '',
    toolCalls: [
      { argumentsText: '{"id":"topic-1"}', id: 'call-1', name: 'read_material' },
      { argumentsText: '{"query":"memo"}', id: 'call-2', name: 'search_materials' }
    ]
  });
});

it('assembles cumulative text and recognizes normal completion', async () => {
  const seen: string[] = [];
  const frames = [chunk({ content: 'Hello' }), chunk({ content: ' world' }, 'stop'), 'data: [DONE]'];
  const result = await readOpenAiCompatibleSse(stream(frames.join('\n\n') + '\n\n'), new AbortController(), (text) => seen.push(text));

  expect(result).toEqual({ finishReason: 'stop', text: 'Hello world', toolCalls: [] });
  expect(seen).toEqual(['Hello', 'Hello world']);
});

it('rejects missing done markers and incomplete tool-call identities', async () => {
  await expect(readOpenAiCompatibleSse(stream(chunk({ content: 'partial' }) + '\n\n'), new AbortController(), () => undefined))
    .rejects.toMatchObject({ category: 'protocol_error' });
  const frames = [chunk({ tool_calls: [{ function: { arguments: '{}' }, index: 0 }] }, 'tool_calls'), 'data: [DONE]'];
  await expect(readOpenAiCompatibleSse(stream(frames.join('\n\n') + '\n\n'), new AbortController(), () => undefined))
    .rejects.toMatchObject({ category: 'protocol_error' });
});

function chunk(delta: Record<string, unknown>, finishReason: string | null = null) {
  return `data: ${JSON.stringify({ choices: [{ delta, finish_reason: finishReason }] })}`;
}

function fragmentedStream(value: string) {
  const bytes = new TextEncoder().encode(value);
  const cuts = [7, 29, 61, 113, bytes.length];
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const cut of cuts) {
        if (cut > offset) controller.enqueue(bytes.slice(offset, cut));
        offset = cut;
      }
      controller.close();
    }
  });
}

function stream(value: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    }
  });
}
