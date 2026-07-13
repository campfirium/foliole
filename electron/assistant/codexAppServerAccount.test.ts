// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { loginCodexWithChatGpt, readCodexAccountState } from './codexAppServerAccount.js';
import { FakeCodexProcess, writeMessage } from './codexAppServerAdapter.testSupport.js';

it('reports a clean Codex home as unauthenticated through account/read', async () => {
  const process = new FakeCodexProcess();
  const result = readCodexAccountState({ appVersion: 'test', spawn: () => process });
  writeMessage(process, { id: 0, result: {} });
  await flushMessages();
  writeMessage(process, { id: 1, result: { account: null, requiresOpenaiAuth: true } });

  await expect(result).resolves.toBe('unauthenticated');
  expect(process.kill).toHaveBeenCalledOnce();
});

it('opens only the trusted browser login URL and waits for completion', async () => {
  const process = new FakeCodexProcess();
  const openExternal = vi.fn(async () => undefined);
  const result = loginCodexWithChatGpt({ appVersion: 'test', openExternal, spawn: () => process });
  writeMessage(process, { id: 0, result: {} });
  await flushMessages();
  writeMessage(process, {
    id: 1,
    result: {
      authUrl: 'https://chatgpt.com/auth/codex?redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback',
      loginId: 'login-1',
      type: 'chatgpt'
    }
  });
  await flushMessages();
  expect(openExternal).toHaveBeenCalledOnce();
  writeMessage(process, {
    method: 'account/login/completed',
    params: { error: null, loginId: 'login-1', success: true }
  });

  await expect(result).resolves.toBeUndefined();
});

it('rejects an untrusted login URL without opening it', async () => {
  const process = new FakeCodexProcess();
  const openExternal = vi.fn(async () => undefined);
  const result = loginCodexWithChatGpt({ appVersion: 'test', openExternal, spawn: () => process });
  writeMessage(process, { id: 0, result: {} });
  await flushMessages();
  writeMessage(process, { id: 1, result: { authUrl: 'https://example.com/login' } });

  await expect(result).rejects.toMatchObject({ category: 'protocol_error' });
  expect(openExternal).not.toHaveBeenCalled();
});

function flushMessages() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}
