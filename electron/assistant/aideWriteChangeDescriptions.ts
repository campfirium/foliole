import type {
  NativeAssistantWriteChange,
  NativeAssistantWriteChangeDetail
} from '../../lib/platform/nativeAssistantContract.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';

import type { AideWriteRequest } from './aideToolSession.js';

const SNIPPET_LENGTH = 120;
const TARGET_KEYS = ['id', 'folder_id', 'source_id'] as const;

type MaterialSummary = { kind: string; title: string };
type MaterialLookup = (id: string) => MaterialSummary | undefined;

/** Turns tool calls into what the person reads on the confirmation card, using titles rather than ids. */
export async function describeAideWriteRequests(requests: AideWriteRequest[]): Promise<NativeAssistantWriteChange[]> {
  try {
    return await runWithDatabaseConnectionOwner(() => {
      const select = openDatabaseConnection().sqlite.prepare('SELECT kind, title FROM nodes WHERE id = ?');
      return requests.map((request) => describe(request, (id) => select.get(id) as MaterialSummary | undefined));
    });
  } catch {
    return requests.map((request) => describe(request, () => undefined));
  }
}

function describe(request: AideWriteRequest, materialOf: MaterialLookup): NativeAssistantWriteChange {
  const args = request.arguments;
  const targetId = TARGET_KEYS.map((key) => args[key]).find((value) => typeof value === 'string');
  const material = targetId === undefined ? undefined : materialOf(targetId);
  const titleOf = (id: string) => text(materialOf(id)?.title) ?? id;
  const details: NativeAssistantWriteChangeDetail[] = [];
  const title = text(args.title);
  const target = targetId === undefined ? title : text(material?.title) ?? targetId;
  if (targetId !== undefined && title) details.push({ field: 'title', value: title });
  if ('parent_id' in args && !(request.tool === 'create_material' && args.parent_id === undefined)) {
    details.push({ field: 'parent', value: typeof args.parent_id === 'string' ? titleOf(args.parent_id) : '' });
  }
  const materialIds = args.material_ids ?? args.source_ids;
  if (Array.isArray(materialIds) && materialIds.length) {
    for (const id of materialIds) details.push({ field: 'materials', value: titleOf(String(id)) });
  }
  const content = snippet(args.content);
  if (content || (request.tool === 'update_material' && typeof args.content === 'string')) {
    const isQuestion = material?.kind === 'item' || args.kind === 'item' || typeof args.reveal === 'string';
    details.push({ field: isQuestion ? 'question' : 'content', value: content ?? '' });
  }
  const answer = snippet(args.reveal);
  if (answer) details.push({ field: 'answer', value: answer });
  return { details, ...(target ? { target } : {}), tool: request.tool };
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function snippet(value: unknown) {
  const value_ = text(value)?.replace(/\s+/gu, ' ');
  if (!value_) return undefined;
  return value_.length > SNIPPET_LENGTH ? `${value_.slice(0, SNIPPET_LENGTH)}…` : value_;
}
