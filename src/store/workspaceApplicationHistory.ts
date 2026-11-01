import type { EditorOperationHistoryEntry } from '../features/editor/model/editorOperationHistoryTypes';

import type { WorkspaceActionHistoryEntry } from './workspaceActionHistoryEntry';
import { rebaseApplicationTrashFacts } from './workspaceApplicationTrashFacts';

export type ApplicationOperation = {
  id: string;
  order: number;
  ready: boolean;
  blocked?: boolean;
} & ({ domain: 'editor'; entry: EditorOperationHistoryEntry } | { domain: 'workspace'; entry: WorkspaceActionHistoryEntry });
export type HistoryDirection = 'undo' | 'redo';
export interface ApplicationReplay {
  id: string;
  operationId: string;
  direction: HistoryDirection;
  branch: number;
  stage: 'reserved' | 'preparing' | 'submitted' | 'applied-pending';
}
export interface ApplicationHistory {
  sessionId: string;
  branch: number;
  nextOrder: number;
  undo: ApplicationOperation[];
  redo: ApplicationOperation[];
  requests: ApplicationReplay[];
  textPresentation?: { nativeTargetKey: string; requestId: string } | undefined;
}
export const APPLICATION_HISTORY_LIMIT = 500;

export function createApplicationHistory(): ApplicationHistory {
  return { sessionId: crypto.randomUUID(), branch: 0, nextOrder: 1, undo: [], redo: [], requests: [] };
}

export function admitApplicationOperation(history: ApplicationHistory, input: Omit<ApplicationOperation, 'order'>): ApplicationHistory {
  const top = history.undo.at(-1);
  const merge = input.domain === 'editor' && input.entry.type === 'text.edit' && top?.domain === 'editor' &&
    top.entry.type === 'text.edit' && top.entry.nativeGroup === input.entry.nativeGroup &&
    top.entry.nativeTargetKey === input.entry.nativeTargetKey && !history.redo.length;
  const operation = { ...input, id: merge ? top.id : input.id, order: merge ? top.order : history.nextOrder } as ApplicationOperation;
  return { ...history, branch: history.branch + 1, nextOrder: history.nextOrder + (merge ? 0 : 1), redo: [], textPresentation: undefined,
    requests: history.requests.filter(request => request.stage === 'submitted' || request.stage === 'applied-pending'),
    undo: [...(merge ? history.undo.slice(0, -1) : history.undo), operation].slice(-APPLICATION_HISTORY_LIMIT) };
}

export function updateApplicationOperation(history: ApplicationHistory, operation: ApplicationOperation): ApplicationHistory {
  const update = (stack: ApplicationOperation[]) => stack.map(value => value.id === operation.id ? { ...operation, order: value.order } : value);
  return { ...history, undo: update(history.undo), redo: update(history.redo) };
}

export function removeApplicationOperation(history: ApplicationHistory, operationId: string): ApplicationHistory {
  const dependency = history.requests.findIndex(request => request.operationId === operationId);
  return { ...history, undo: history.undo.filter(value => value.id !== operationId), redo: history.redo.filter(value => value.id !== operationId),
    requests: dependency < 0 ? history.requests : history.requests.slice(0, dependency) };
}

function moveOperation(history: ApplicationHistory, request: ApplicationReplay, operation: ApplicationOperation): ApplicationHistory {
  const source = request.direction === 'undo' ? 'undo' : 'redo';
  const destination = request.direction === 'undo' ? 'redo' : 'undo';
  return { ...history, [source]: history[source].filter(value => value.id !== operation.id),
    [destination]: request.branch === history.branch ? [...history[destination].filter(value => value.id !== operation.id), operation] : history[destination] };
}

/** Reservations project the one logical position; they never hold another mutable stack. */
export function getApplicationHistoryTarget(history: ApplicationHistory, direction: HistoryDirection) {
  let projected = history;
  for (const request of history.requests) {
    if (request.stage === 'applied-pending') continue;
    const operation = [...projected.undo, ...projected.redo].find(value => value.id === request.operationId);
    if (operation) projected = moveOperation(projected, request, operation);
  }
  return projected[direction].at(-1) ?? null;
}

export function reserveApplicationReplay(history: ApplicationHistory, direction: HistoryDirection): ApplicationHistory {
  const operation = getApplicationHistoryTarget(history, direction);
  if (!operation || operation.blocked || history.requests.length >= 50) return history;
  return { ...history, requests: [...history.requests, { id: crypto.randomUUID(), operationId: operation.id,
    direction, branch: history.branch, stage: 'reserved' }] };
}

export function startApplicationReplay(history: ApplicationHistory): ApplicationHistory {
  const request = history.requests[0];
  const operation = request && [...history.undo, ...history.redo].find(value => value.id === request.operationId);
  if (!request || request.stage !== 'reserved' || !operation?.ready) return history;
  return { ...history, requests: [{ ...request, stage: 'preparing' }, ...history.requests.slice(1)] };
}

export function markApplicationReplaySubmitted(history: ApplicationHistory, requestId: string): ApplicationHistory {
  return { ...history, requests: history.requests.map(request => request.id === requestId ? { ...request, stage: 'submitted' } : request) };
}

/** Text changes move the logical cursor immediately; their exact save remains pending. */
export function applyApplicationTextReplay(history: ApplicationHistory, requestId: string, operation: ApplicationOperation): ApplicationHistory {
  const request = history.requests[0];
  if (request?.id !== requestId || request.stage === 'applied-pending') return history;
  const moved = moveOperation(updateApplicationOperation(history, operation), request, operation);
  return { ...moved, ...(operation.domain === 'editor' && operation.entry.type === 'text.edit' ?
    { textPresentation: { nativeTargetKey: operation.entry.nativeTargetKey, requestId } } : {}),
    requests: [{ ...request, stage: 'applied-pending' }, ...history.requests.slice(1)] };
}

export function settleApplicationReplay(history: ApplicationHistory, requestId: string, result:
  { status: 'committed'; operation: ApplicationOperation } | { status: 'rejected' | 'indeterminate' }): ApplicationHistory {
  const request = history.requests[0];
  if (request?.id !== requestId) return history;
  if (result.status !== 'committed') {
    const operation = [...history.undo, ...history.redo].find(value => value.id === request.operationId);
    const blocked = result.status === 'indeterminate' && operation
      ? updateApplicationOperation(history, { ...operation, blocked: true }) : history;
    return { ...blocked, requests: [] };
  }
  const updated = rebaseApplicationTrashFacts(updateApplicationOperation(history, result.operation), result.operation, request.direction);
  const moved = request.stage === 'applied-pending' ? updated : moveOperation(updated, request, result.operation);
  return { ...moved, requests: history.requests.slice(1) };
}
