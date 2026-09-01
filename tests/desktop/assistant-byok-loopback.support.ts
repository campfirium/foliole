import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import type { Page } from '@playwright/test';

import {
  acquireMacosHiddenCredentialSessionLock,
  resolveMacosHiddenCredentialSession
} from '../../scripts/desktop/macos-hidden-electron-credential-session.mjs';
import { prepareMacosHiddenElectronRuntime } from '../../scripts/desktop/macos-hidden-electron-runtime.mjs';

export type LoopbackRequest = {
  authorization: string;
  body: {
    messages?: Array<{ content?: unknown; role?: string; tool_call_id?: string }>;
    model?: string;
    stream?: boolean;
    tool_choice?: unknown;
    tools?: unknown[];
  };
};
type ResponseMode = 'auth' | 'success';

export async function createByokLoopbackHarness() {
  const appRoot = process.cwd();
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-t141-byok-chat-'));
  const runtime = prepareMacosHiddenElectronRuntime({ appRoot, env: process.env });
  const session = resolveMacosHiddenCredentialSession(appRoot, runtime.runtimeFingerprint, stateRoot);
  const release = acquireMacosHiddenCredentialSessionLock(session);
  const codexFixture = path.join(stateRoot, 'codex-fixture.mjs');
  const codexLog = path.join(stateRoot, 'codex-methods.log');
  await writeFile(codexFixture, createCodexFixtureSource(codexLog));
  await chmod(codexFixture, 0o700);
  const loopback = await startLoopbackServer();
  return {
    codexTurnCount: async () => (await readFile(codexLog, 'utf8').catch(() => ''))
      .split('\n').filter((line) => line === 'turn/start').length,
    close: async () => {
      await loopback.close();
      release();
      runtime.cleanup();
      await rm(stateRoot, { force: true, recursive: true });
    },
    endpoint: loopback.endpoint,
    launch: () => launchApp({ appRoot, codexFixture, runtime, session, stateRoot }),
    requests: loopback.requests,
    setMode: loopback.setMode
  };
}

async function launchApp(input: {
  appRoot: string;
  codexFixture: string;
  runtime: ReturnType<typeof prepareMacosHiddenElectronRuntime>;
  session: ReturnType<typeof resolveMacosHiddenCredentialSession>;
  stateRoot: string;
}) {
  const { _electron } = await import('playwright');
  const rendererUrl = pathToFileURL(path.join(input.appRoot, 'dist/desktop/index.html')).toString();
  const electronApp = await _electron.launch({
    args: [input.session.bootstrapPath], cwd: input.appRoot,
    executablePath: input.runtime.executablePath,
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: rendererUrl,
      FOLIOLE_ALLOW_PARALLEL_INSTANCE: '1',
      FOLIOLE_CODEX_COMMAND: input.codexFixture,
      FOLIOLE_DISABLE_HARDWARE_ACCELERATION: '1',
      FOLIOLE_DISABLE_IN_APP_RELAUNCH: '1',
      FOLIOLE_ELECTRON_NATIVE_HIDDEN: '1',
      FOLIOLE_ELECTRON_TEST_STATE_ROOT: input.stateRoot,
      FOLIOLE_HIDDEN_CREDENTIAL_APP_NAME: input.session.appName,
      FOLIOLE_HIDDEN_CREDENTIAL_MAIN_PATH: path.join(input.appRoot, 'dist/electron/main.js'),
      FOLIOLE_LIBRARY_HOME: path.join(input.stateRoot, 'library'),
      FOLIOLE_SESSION_DATA_PATH: input.session.userDataPath,
      FOLIOLE_SKIP_STARTUP_WINDOW_STATE: '1',
      FOLIOLE_USER_DATA_PATH: input.session.userDataPath,
      FOLIOLE_WORKDIR: input.stateRoot
    },
    timeout: 90_000
  });
  const page = await electronApp.firstWindow({ timeout: 30_000 });
  await page.waitForURL(rendererUrl, { timeout: 30_000 });
  await page.waitForFunction(() => globalThis.__FOLIOLE_APP_READY_REPORTED__ === true);
  await page.setViewportSize({ width: 1600, height: 1000 });
  return { electronApp, page };
}

async function startLoopbackServer() {
  const requests: LoopbackRequest[] = [];
  let mode: ResponseMode = 'success';
  const server = createServer(async (request, response) => {
    const body = await readJsonBody(request);
    if (mode === 'auth') {
      response.writeHead(401, { 'content-type': 'application/json' });
      response.end('{"error":"sensitive-loopback-detail"}');
      return;
    }
    if (isProbeRequest(body)) {
      respondToProbe(response, body);
      return;
    }
    requests.push({ authorization: String(request.headers.authorization ?? ''), body });
    respondToTurn(response, body);
  });
  await listen(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('loopback_listen_failed');
  return {
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
    endpoint: `http://127.0.0.1:${address.port}/v1/chat/completions`,
    requests,
    setMode: (next: ResponseMode) => { mode = next; }
  };
}

function isProbeRequest(body: LoopbackRequest['body']) {
  return JSON.stringify(body.tools).includes('foliole_aide_tool_contract_probe');
}

function respondToProbe(response: import('node:http').ServerResponse, body: LoopbackRequest['body']) {
  const replayed = body.messages?.some((message) => message.tool_call_id === 'probe-1');
  if (replayed) {
    if (!JSON.stringify(body.messages).includes('probe-signature')) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end('{"error":"missing opaque tool-call extension"}');
      return;
    }
    sendSse(response, [{ choices: [{ delta: { content: 'Probe complete' }, finish_reason: 'stop' }] }]);
    return;
  }
  sendSse(response, [
    { choices: [{ delta: { tool_calls: [{
      extra_content: { provider: { opaque_signature: 'probe-signature' } },
      function: { arguments: '{', name: 'foliole_aide_tool_contract_probe' },
      id: 'probe-1', index: 0, type: 'function'
    }] } }] },
    { choices: [{ delta: { tool_calls: [{ function: { arguments: '}' }, index: 0 }] }, finish_reason: 'stop' }] }
  ]);
}

function respondToTurn(response: import('node:http').ServerResponse, body: LoopbackRequest['body']) {
  const prompt = readLatestUserText(body.messages ?? []);
  const hasToolResults = body.messages?.some((message) => message.role === 'tool');
  if (prompt.includes('Long loopback chain')) {
    respondToLongToolChain(response, body);
    return;
  }
  if (prompt.includes('Loopback first') && !hasToolResults) {
    sendSse(response, [{ choices: [{ delta: { tool_calls: [
      {
        ...toolCall(0, 'read-root', 'list_folder', '{"parent_id":null,"limit":20}'),
        extra_content: { provider: { opaque_signature: 'turn-signature' } }
      },
      toolCall(1, 'create-topic', 'create_material', '{"kind":"topic","parent_id":null,"title":"BYOK Agent Control Topic"}')
    ] }, finish_reason: 'tool_calls' }] }]);
    return;
  }
  const reply = prompt.includes('Loopback first') ? 1
    : prompt.includes('Loopback image') ? 2
      : prompt.includes('After restart') ? 3
        : prompt.includes('Recovered after reconfigure') ? 4 : 5;
  sendSse(response, [{ choices: [{ delta: { content: `Loopback reply ${reply}` }, finish_reason: 'stop' }] }]);
}

function respondToLongToolChain(
  response: import('node:http').ServerResponse,
  body: LoopbackRequest['body']
) {
  const completedCalls = body.messages?.filter((message) => message.role === 'tool').length ?? 0;
  if (completedCalls < 27) {
    const round = Math.floor(completedCalls / 3);
    sendSse(response, [{ choices: [{ delta: { tool_calls: Array.from({ length: 3 }, (_, index) =>
      toolCall(index, `long-read-${round}-${index}`, 'list_folder', '{"parent_id":null,"limit":1}'))
    }, finish_reason: 'tool_calls' }] }]);
    return;
  }
  if (completedCalls === 27) {
    sendSse(response, [{ choices: [{ delta: { tool_calls: [toolCall(
      0, 'long-write', 'create_material',
      '{"kind":"topic","parent_id":null,"title":"BYOK Long Tool Chain Topic"}'
    )] }, finish_reason: 'tool_calls' }] }]);
    return;
  }
  sendSse(response, [{ choices: [{ delta: { content: 'Long loopback reply' }, finish_reason: 'stop' }] }]);
}

function toolCall(index: number, id: string, name: string, argumentsValue: string) {
  return { function: { arguments: argumentsValue, name }, id, index, type: 'function' };
}

function readLatestUserText(messages: NonNullable<LoopbackRequest['body']['messages']>) {
  const content = [...messages].reverse().find((message) => message.role === 'user')?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((item) => item && typeof item === 'object' && 'text' in item
    ? String((item as { text?: unknown }).text ?? '') : '').join(' ');
}

function sendSse(response: import('node:http').ServerResponse, chunks: unknown[]) {
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const chunk of chunks) response.write(`data: ${JSON.stringify(chunk)}\n\n`);
  response.end('data: [DONE]\n\n');
}

function listen(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
}

async function readJsonBody(request: import('node:http').IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function prepareAide(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem('foliole-app-language', 'en');
    localStorage.setItem('foliole-workspace-right-sidebar-active-panel', 'assistant');
  });
  await page.reload();
}

function createCodexFixtureSource(logPath: string) {
  return `#!${process.execPath}\nimport fs from 'node:fs';\nconst log=${JSON.stringify(logPath)};\nif(process.argv.includes('--version')){console.log('codex-cli 0.0.0-t141');process.exit(0)}\nprocess.stdin.setEncoding('utf8');let input='';\nconst send=(value)=>console.log(JSON.stringify(value));\nprocess.stdin.on('data',(chunk)=>{input+=chunk;const lines=input.split(/\\r?\\n/u);input=lines.pop()??'';for(const line of lines){if(!line)continue;const message=JSON.parse(line);if(message.method)fs.appendFileSync(log,message.method+'\\n');if(message.method==='initialize')send({id:message.id,result:{}});if(message.method==='account/read')send({id:message.id,result:{account:{type:'chatgpt'},requiresOpenaiAuth:true}});if(message.method==='model/list')send({id:message.id,result:{data:[{defaultReasoningEffort:'high',description:'Fixture model',displayName:'Codex Fixture',hidden:false,isDefault:true,model:'codex-fixture',serviceTiers:[],supportedReasoningEfforts:[{description:'High',reasoningEffort:'high'}]}],nextCursor:null}});if(message.method==='skills/extraRoots/set')send({id:message.id,result:{}});if(message.method==='thread/start')send({id:message.id,result:{thread:{id:'codex-thread'}}});if(message.method==='turn/start'){send({method:'turn/started',params:{turn:{id:'codex-turn'}}});send({method:'item/agentMessage/delta',params:{delta:'Codex regression reply'}});send({method:'turn/completed',params:{turn:{id:'codex-turn',status:'completed'}}})}}});\n`;
}
