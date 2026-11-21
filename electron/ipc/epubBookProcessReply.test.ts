// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { replyThenDisconnect } from './epubBookProcessReply.js';

it('keeps the parent channel open until the parsed book has been fully sent', () => {
  let flush: ((error: Error | null) => void) | undefined;
  const channel = {
    disconnect: vi.fn(),
    send: vi.fn((_message: unknown, callback: (error: Error | null) => void) => { flush = callback; return false; })
  };

  replyThenDisconnect({ book: { title: 'x'.repeat(128 * 1024) } }, channel);

  expect(channel.send).toHaveBeenCalledOnce();
  expect(channel.disconnect).not.toHaveBeenCalled();
  flush?.(null);
  expect(channel.disconnect).toHaveBeenCalledOnce();
});

it('still disconnects when the send itself fails so the parent sees the process end', () => {
  const channel = {
    disconnect: vi.fn(),
    send: vi.fn((_message: unknown, callback: (error: Error | null) => void) => { callback(new Error('closed')); return false; })
  };

  replyThenDisconnect({ error: 'EPUB import failed' }, channel);

  expect(channel.disconnect).toHaveBeenCalledOnce();
});
