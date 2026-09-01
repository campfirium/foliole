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

export type LoopbackRequest = { authorization: string; body: { messages?: unknown[]; model?: string; stream?: boolean } };
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
    if (body.stream !== false) {
      requests.push({ authorization: String(request.headers.authorization ?? ''), body });
    }
    if (mode === 'auth') {
      response.writeHead(401, { 'content-type': 'application/json' });
      response.end('{"error":"sensitive-loopback-detail"}');
      return;
    }
    if (body.stream === false) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"choices":[{"message":{"content":"OK"}}]}');
      return;
    }
    const turn = requests.length;
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.write(`data: {"choices":[{"delta":{"content":"Loopback "}}]}\n\n`);
    setTimeout(() => {
      response.write(`data: {"choices":[{"delta":{"content":"reply ${turn}"}}]}\n\n`);
      response.end('data: [DONE]\n\n');
    }, 250);
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
