/* global clearTimeout, setTimeout */

import readline from 'node:readline';

export function createOnlineSmokeJsonRpcSession(child, timeoutMs, onRequest) {
  const pending = new Map();
  let assistantText = '';
  let turnComplete;
  let stderr = '';
  const rl = readline.createInterface({ input: child.stdout });
  const timeout = setTimeout(() => {
    const error = new Error(`codex_app_server_timeout${stderr ? `: ${stderr.slice(0, 500)}` : ''}`);
    for (const item of pending.values()) item.reject(error);
    turnComplete?.reject(error);
    child.kill();
  }, timeoutMs);
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });
  rl.on('line', (line) => handleMessage(JSON.parse(line)));
  child.on('error', (error) => {
    for (const item of pending.values()) item.reject(error);
    turnComplete?.reject(error);
  });

  function handleMessage(message) {
    if (message.id !== undefined && message.method === 'item/tool/call') {
      void Promise.resolve(onRequest?.(message)).then(
        (result) => write({ id: message.id, result }),
        () => write({ id: message.id, result: toolFailure('tool_execution_failed') })
      );
      return;
    }
    if (message.id !== undefined && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) item.reject(new Error(JSON.stringify(message.error)));
      else item.resolve(message);
      return;
    }
    if (message.method === 'item/agentMessage/delta') {
      assistantText += message.params?.delta ?? message.params?.text ?? '';
    }
    if (message.method === 'turn/completed') turnComplete?.resolve(assistantText);
    if (message.method === 'error') {
      turnComplete?.reject(new Error(JSON.stringify(message.params ?? message)));
    }
  }

  return {
    notify(message) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
    },
    request(message) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
      return new Promise((resolve, reject) => pending.set(message.id, { reject, resolve }));
    },
    waitForTurn() {
      return new Promise((resolve, reject) => {
        turnComplete = { reject, resolve };
      }).finally(() => clearTimeout(timeout));
    }
  };

  function write(message) {
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  }
}

function toolFailure(error) {
  return { contentItems: [{ type: 'inputText', text: JSON.stringify({ error }) }], success: false };
}
