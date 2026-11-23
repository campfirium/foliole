import type {
  NativeAssistantWriteChange,
  NativeAssistantWriteChangeDetail
} from '../../lib/platform/nativeAssistantContract.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';

import type { AideWriteRequest } from './aideToolSession.js';

const SNIPPET_LENGTH = 120;
const TARGET_KEYS = ['id', 'folder_id', 'source_id'] as const;

type TitleLookup = (id: string) => string;

/** Turns tool calls into what the person reads on the confirmation card, using titles rather than ids. */
export async function describeAideWriteRequests(requests: AideWriteRequest[]): Promise<NativeAssistantWriteChange[]> {
  try {
    return await runWithDatabaseConnectionOwner(() => {
      const select = openDatabaseConnection().sqlite.prepare('SELECT title FROM nodes WHERE id = ?').pluck();
      const titleOf: TitleLookup = (id) => {
        const title = select.get(id);
        return typeof title === 'string' && title.trim() ? title : id;
      };
      return requests.map((request) => describe(request, titleOf));
    });
  } catch {
    return requests.map((request) => describe(request, (id) => id));
  }
}

function describe(request: AideWriteRequest, titleOf: TitleLookup): NativeAssistantWriteChange {
  const args = request.arguments;
  const targetId = TARGET_KEYS.map((key) => args[key]).find((value) => typeof value === 'string');
  const details: NativeAssistantWriteChangeDetail[] = [];
  const target = typeof targetId === 'string' ? titleOf(targetId) : text(args.title) ?? snippet(args.content);
  if (typeof targetId === 'string' && text(args.title)) details.push({ field: 'title', value: String(args.title) });
  if ('parent_id' in args && !(request.tool === 'create_material' && args.parent_id === undefined)) {
    details.push({ field: 'parent', value: typeof args.parent_id === 'string' ? titleOf(args.parent_id) : '' });
  }
  const materialIds = args.material_ids ?? args.source_ids;
  if (Array.isArray(materialIds) && materialIds.length) {
    for (const id of materialIds) details.push({ field: 'materials', value: titleOf(String(id)) });
  }
  const content = snippet(args.content ?? args.reveal);
  if (content && content !== target) details.push({ field: 'content', value: content });
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
