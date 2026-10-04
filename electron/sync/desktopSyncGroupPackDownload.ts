import { promises as fs } from 'node:fs';

import { DEFAULT_SYNC_PACK_PAGE_BUDGET } from '../database/syncPackPageBudget.js';

import { readDesktopWorkgroupResponse } from './desktopSyncGroupHttp.js';
import { WORKGROUP_ENVELOPE_CONTENT_TYPE } from './workgroupHttpCrypto.js';

export const DESKTOP_SYNC_GROUP_STRUCTURE_TIMEOUT_MS = 30_000;

export async function fetchDesktopSyncGroupPackBody(args: {
  body?: string;
  headers: Record<string, string>;
  groupId: string;
  method?: 'GET' | 'POST';
  pathWithQuery: string;
  outputPath: string;
  timeoutMs?: number;
  url: string;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    args.timeoutMs ?? DESKTOP_SYNC_GROUP_STRUCTURE_TIMEOUT_MS
  );
  try {
    const method = args.method ?? 'GET';
    const response = await fetch(args.url, { headers: args.headers, signal: controller.signal,
      method, ...(args.body === undefined ? {} : { body: args.body }) });
    if (!response.ok) await readDesktopWorkgroupResponse({
      contentType: 'application/zip', groupId: args.groupId,
      maxEnvelopeBytes: 1024 * 1024,
      method, pathWithQuery: args.pathWithQuery, response
    });
    if (response.headers.get('content-type') !== WORKGROUP_ENVELOPE_CONTENT_TYPE ||
        !response.body) throw new Error('workgroup_aead_response_required');
    const file = await fs.open(args.outputPath, 'w');
    const reader = response.body.getReader();
    try {
      let bytes = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > DEFAULT_SYNC_PACK_PAGE_BUDGET.transferBytes) {
          throw new Error('sync_pack_encrypted_payload_limit_exceeded');
        }
        await file.writeFile(value);
      }
    } catch (error) {
      try { await reader.cancel(); } catch { /* Preserve the transfer error. */ }
      throw error;
    } finally {
      await file.close();
    }
    return args.outputPath;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('sync_group_structure_pack_timeout', { cause: error });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
