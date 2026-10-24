import { createReadStream, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

import Database from 'better-sqlite3';
import type { HtmlTagDescriptor, Plugin } from 'vite';

import { createCompanionPreviewSqliteHost } from './companionPreviewSqliteHost';

export const COMPANION_PREVIEW_DATABASE_ENV = 'FOLIOLE_COMPANION_PREVIEW_DB';
export const COMPANION_PREVIEW_SQLITE_PATH = '/__foliole_preview/sqlite';
export const COMPANION_PREVIEW_ATTACHMENTS_PATH = '/__foliole_preview/attachments';
const PREVIEW_HOST_MODULE = 'scripts/vite/companionPreviewHost.ts';
const FRESH_LIBRARY_HOST_NAME = 'Web preview';

type PreviewHost = ReturnType<typeof createCompanionPreviewSqliteHost>;

function readBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => { body += chunk; });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function send(response: ServerResponse, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

export async function handleCompanionPreviewSqlite(host: PreviewHost, body: string) {
  try {
    const { method, options } = JSON.parse(body) as { method: string; options: unknown };
    return { status: 200, payload: { ok: true, result: host.call(method, options ?? {}) } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as { code?: unknown })?.code;
    return { status: 200, payload: { ok: false, message, ...(typeof code === 'string' ? { code } : {}) } };
  }
}

// A copied library keeps the host name it was created under; a fresh one gets the preview name.
export function readCompanionPreviewHostName(databaseFile: string) {
  if (!existsSync(databaseFile)) return FRESH_LIBRARY_HOST_NAME;
  const database = new Database(databaseFile, { fileMustExist: true, readonly: true });
  try {
    const row = database.prepare("SELECT value FROM companion_meta WHERE key = 'host_name'").get() as
      { value?: unknown } | undefined;
    return typeof row?.value === 'string' && row.value.trim() ? row.value.trim() : FRESH_LIBRARY_HOST_NAME;
  } finally {
    database.close();
  }
}

export function companionPreviewHostTags(projectRoot: string, hostName: string): HtmlTagDescriptor[] {
  return [
    { tag: 'script', injectTo: 'head-prepend',
      children: `window.__FOLIOLE_COMPANION_PREVIEW_HOST__ = ${JSON.stringify(hostName)};` },
    { tag: 'script', injectTo: 'head-prepend',
      attrs: { type: 'module', src: `/@fs/${path.resolve(projectRoot, PREVIEW_HOST_MODULE).replace(/^\/+/u, '')}` } }
  ];
}

const ATTACHMENT_CONTENT_TYPES: Record<string, string> = {
  '.gif': 'image/gif', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.pdf': 'application/pdf',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp'
};

// Mirrors the phone: an attachment lives at `files/attachments/<storage key>` beside the library.
export function resolveCompanionPreviewAttachment(databaseFile: string, storageKey: string) {
  const root = path.join(path.dirname(databaseFile), 'files', 'attachments');
  const file = path.resolve(root, decodeURIComponent(storageKey));
  if (!file.startsWith(`${root}${path.sep}`) || !existsSync(file) || !statSync(file).isFile()) return null;
  return { contentType: ATTACHMENT_CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', file };
}

function serveAttachment(databaseFile: string, request: IncomingMessage, response: ServerResponse) {
  const storageKey = (request.url ?? '').replace(/^\/+/u, '').split('?')[0] ?? '';
  const found = resolveCompanionPreviewAttachment(databaseFile, storageKey);
  if (!found) return send(response, 404, { ok: false, message: 'Attachment is not in the preview copy.' });
  response.statusCode = 200;
  response.setHeader('Content-Type', found.contentType);
  if (request.method === 'HEAD') return response.end();
  createReadStream(found.file).pipe(response);
}

/** Serves the companion preview database only to the local Vite dev server. */
export function companionPreviewServerPlugin(projectRoot: string, env: NodeJS.ProcessEnv = process.env): Plugin {
  const databaseFile = env[COMPANION_PREVIEW_DATABASE_ENV];
  return {
    name: 'foliole-companion-preview-server',
    apply: 'serve',
    transformIndexHtml() {
      if (!databaseFile) return [];
      return companionPreviewHostTags(projectRoot, readCompanionPreviewHostName(databaseFile));
    },
    configureServer(server) {
      if (!databaseFile) return;
      const host = createCompanionPreviewSqliteHost(databaseFile);
      server.httpServer?.once('close', () => host.close());
      server.middlewares.use(COMPANION_PREVIEW_ATTACHMENTS_PATH, (request, response) =>
        serveAttachment(databaseFile, request, response));
      server.middlewares.use(COMPANION_PREVIEW_SQLITE_PATH, (request, response) => {
        if (request.method !== 'POST') return send(response, 405, { ok: false, message: 'POST only' });
        void readBody(request).then(async (body) => {
          const { payload, status } = await handleCompanionPreviewSqlite(host, body);
          send(response, status, payload);
        });
      });
    }
  };
}
