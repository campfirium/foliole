import { describe, expect, it } from 'vitest';

import { createAnnotationHistoryEntry } from '../features/editor/model/editorOperationHistory.testSupport';

import { admitApplicationOperation, applyApplicationTextReplay, createApplicationHistory, getApplicationHistoryTarget,
  markApplicationReplaySubmitted, removeApplicationOperation, reserveApplicationReplay, settleApplicationReplay,
  startApplicationReplay, updateApplicationOperation, type ApplicationHistory, type ApplicationOperation } from './workspaceApplicationHistory';

function annotation(id: string, ready = true): ApplicationOperation {
  return { id, ready, order: 0, domain: 'editor', entry: createAnnotationHistoryEntry(id, 'annotation.create') };
}
function admit(history: ApplicationHistory, id: string, ready = true) {
  return admitApplicationOperation(history, annotation(id, ready));
}
function start(history: ApplicationHistory, direction: 'undo' | 'redo' = 'undo') {
  return startApplicationReplay(reserveApplicationReplay(history, direction));
}
function commit(history: ApplicationHistory) {
  const request = history.requests[0]!;
  const operation = [...history.undo, ...history.redo].find(value => value.id === request.operationId)!;
  return settleApplicationReplay(history, request.id, { status: 'committed', operation });
}
function ids(stack: ApplicationOperation[]) { return stack.map(value => value.id); }

describe('application action order and bound replay requests', () => {
  it('keeps admission order when a later action settles before an earlier creation', () => {
    let history = admit(admit(createApplicationHistory(), 'creation', false), 'answer');
    history = updateApplicationOperation(history, annotation('creation'));
    expect(ids(history.undo)).toEqual(['creation', 'answer']);
    expect(getApplicationHistoryTarget(history, 'undo')?.id).toBe('answer');
    history = start(history);
    history = commit(history);
    expect(getApplicationHistoryTarget(history, 'undo')?.id).toBe('creation');
  });

  it('reserves distinct consecutive targets and waits for the exact pending creation', () => {
    let history = admit(admit(createApplicationHistory(), 'a', false), 'b');
    history = start(history);
    history = reserveApplicationReplay(history, 'undo');
    expect(history.requests.map(value => value.operationId)).toEqual(['b', 'a']);
    history = commit(history);
    expect(startApplicationReplay(history).requests[0]?.stage).toBe('reserved');
    history = updateApplicationOperation(history, annotation('a'));
    history = startApplicationReplay(history);
    expect(history.requests[0]?.stage).toBe('preparing');
    history = commit(history);
    expect(ids(history.redo)).toEqual(['b', 'a']);
    history = commit(start(history, 'redo'));
    history = commit(start(history, 'redo'));
    expect(ids(history.undo)).toEqual(['a', 'b']);
  });

  it('binds an opposite request to the operation reserved immediately before it', () => {
    let history = start(admit(createApplicationHistory(), 'a'));
    history = reserveApplicationReplay(history, 'redo');
    expect(history.requests.map(value => [value.operationId, value.direction])).toEqual([['a', 'undo'], ['a', 'redo']]);
    history = commit(history);
    history = commit(startApplicationReplay(history));
    expect(ids(history.undo)).toEqual(['a']);
    expect(history.redo).toEqual([]);
  });

  it('cancels unstarted requests on new input but settles an already submitted change without reviving redo', () => {
    let history = start(admit(admit(createApplicationHistory(), 'a'), 'b'));
    const request = history.requests[0]!;
    history = markApplicationReplaySubmitted(history, request.id);
    history = reserveApplicationReplay(history, 'undo');
    history = admit(history, 'c');
    expect(history.requests.map(value => value.operationId)).toEqual(['b']);
    history = commit(history);
    expect(ids(history.undo)).toEqual(['a', 'c']);
    expect(history.redo).toEqual([]);
  });

  it('moves text immediately and keeps later typing while its exact save is pending', () => {
    let history = start(admit(createApplicationHistory(), 'text'));
    const request = history.requests[0]!;
    history = applyApplicationTextReplay(history, request.id, history.undo[0]!);
    expect(history.undo).toEqual([]);
    expect(ids(history.redo)).toEqual(['text']);
    history = admit(history, 'new-input');
    history = settleApplicationReplay(history, request.id, { status: 'committed', operation: annotation('text') });
    expect(ids(history.undo)).toEqual(['new-input']);
    expect(history.redo).toEqual([]);
  });

});

describe('replay rejection and retention', () => {
  it.each(['rejected', 'indeterminate'] as const)('stops dependent replays after %s without skipping the blocked operation', status => {
    let history = start(admit(admit(createApplicationHistory(), 'a'), 'b'));
    history = reserveApplicationReplay(history, 'undo');
    history = settleApplicationReplay(history, history.requests[0]!.id, { status });
    expect(history.requests).toEqual([]);
    expect(getApplicationHistoryTarget(history, 'undo')?.id).toBe('b');
    expect(ids(history.undo)).toEqual(['a', 'b']);
  });

  it('cancels preparation on new input before any fact was changed', () => {
    const history = admit(start(admit(createApplicationHistory(), 'a')), 'b');
    expect(history.requests).toEqual([]);
    expect(ids(history.undo)).toEqual(['a', 'b']);
  });

  it('requires reconciliation before retrying an indeterminate write', () => {
    let history = start(admit(createApplicationHistory(), 'a'));
    history = settleApplicationReplay(history, history.requests[0]!.id, { status: 'indeterminate' });
    expect(reserveApplicationReplay(history, 'undo').requests).toEqual([]);
    history = updateApplicationOperation(history, annotation('a'));
    expect(reserveApplicationReplay(history, 'undo').requests).toHaveLength(1);
  });

  it('removes a failed in-flight creation and its dependent reservations only', () => {
    let history = start(admit(admit(createApplicationHistory(), 'a'), 'b', false));
    history = reserveApplicationReplay(history, 'undo');
    history = removeApplicationOperation(history, 'b');
    expect(history.requests).toEqual([]);
    expect(ids(history.undo)).toEqual(['a']);
  });

  it('cuts only the oldest global prefix across more than twelve documents', () => {
    let history = createApplicationHistory();
    for (let i = 0; i < 510; i++) history = admit(history, String(i));
    expect(ids(history.undo)).toEqual(Array.from({ length: 500 }, (_, i) => String(i + 10)));
    expect(history.nextOrder).toBe(511);
    expect(new Set(history.undo.map(value => value.order)).size).toBe(500);
  });
});
