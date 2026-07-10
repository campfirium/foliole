/* global clearTimeout, setTimeout */

import readline from 'node:readline';

export function createOnlineSmokeJsonRpcSession(child, timeoutMs) {
  const pending = new Map();
  const pendingTools = new Map();
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
    if (message.id !== undefined && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) item.reject(new Error(JSON.stringify(message.error)));
      else item.resolve(message);
      return;
    }
    trackToolCall(message, pendingTools);
    if (message.method === 'mcpServer/elicitation/request' && message.id !== undefined) {
      child.stdin.write(`${JSON.stringify(createElicitationResponse(message, pendingTools))}\n`);
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
}

function trackToolCall(message, pendingTools) {
  if (message.method !== 'item/started' || message.params?.item?.type !== 'mcpToolCall') return;
  const { server, tool } = message.params.item;
  const key = turnKey(message.params);
  if (server === 'foliole_agent_control' && typeof tool === 'string' && key) pendingTools.set(key, tool);
}

function createElicitationResponse(message, pendingTools) {
  const key = turnKey(message.params);
  const tool = key ? pendingTools.get(key) : null;
  const accept = message.params?.serverName === 'foliole_agent_control' &&
    message.params?.mode === 'form' &&
    tool === 'foliole_materials_read';
  return {
    id: message.id,
    jsonrpc: '2.0',
    result: accept ? { action: 'accept', content: {} } : { action: 'decline', content: null }
  };
}

function turnKey(params) {
  return typeof params?.threadId === 'string' && typeof params?.turnId === 'string'
    ? `${params.threadId}:${params.turnId}`
    : null;
}
