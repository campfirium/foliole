import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type { NativePdfDocumentSearchResult } from '../../../../lib/platform/nativePdfDocumentSearchContract';
import { getRuntimeInvoke } from '../runtimeInvoke';

export interface RuntimePdfDocumentSearchMatch {
  fragments: Array<{ end: number; page: number; start: number }>;
  id: string;
  matchStart: number;
  page: number;
}

export interface RuntimePdfDocumentSearchResult {
  matches: RuntimePdfDocumentSearchMatch[];
  status: NativePdfDocumentSearchResult['status'];
}

function isStatus(value: unknown): value is RuntimePdfDocumentSearchResult['status'] {
  return value === 'failed' || value === 'indexing' || value === 'pending' || value === 'ready' || value === 'unavailable';
}

function toMatch(value: unknown): RuntimePdfDocumentSearchMatch | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  if (typeof payload.id !== 'string' || typeof payload.match_start !== 'number' || typeof payload.page !== 'number' || !Array.isArray(payload.fragments)) return null;
  const fragments = payload.fragments.filter((fragment): fragment is { end: number; page: number; start: number } => {
    if (!fragment || typeof fragment !== 'object' || Array.isArray(fragment)) return false;
    const entry = fragment as Record<string, unknown>;
    return typeof entry.end === 'number' && typeof entry.page === 'number' && typeof entry.start === 'number';
  });
  if (fragments.length !== payload.fragments.length) return null;
  return { fragments, id: payload.id, matchStart: payload.match_start, page: payload.page };
}

export function toRuntimePdfDocumentSearchResult(value: unknown): RuntimePdfDocumentSearchResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  if (!isStatus(payload.status) || !Array.isArray(payload.matches)) return null;
  const matches = payload.matches.map(toMatch);
  if (matches.some((match) => !match)) return null;
  return { matches: matches.filter((match): match is RuntimePdfDocumentSearchMatch => Boolean(match)), status: payload.status };
}

export async function searchRuntimePdfDocument(nodeId: string, query: string) {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  return toRuntimePdfDocumentSearchResult(await invoke(NATIVE_COMMANDS.searchPdfDocument, { node_id: nodeId, query }));
}
