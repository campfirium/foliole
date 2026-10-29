import { history, invertedEffects, isolateHistory, redoDepth, undoDepth } from '@codemirror/commands';
import { EditorState, StateEffect, StateField, Transaction } from '@codemirror/state';

export interface NativeTextHistoryGroups {
  boundary: boolean;
  applicationBoundary: object | null;
  redo: readonly object[];
  undo: readonly object[];
}

export const nativeTextHistoryBoundary = StateEffect.define<boolean>();
export const nativeAnswerPresenceChange = StateEffect.define<{ before: boolean; after: boolean }>();
const applicationBoundaryEffect = StateEffect.define<object | null>();
const joinedTransactions = new WeakSet<Transaction>();

export function isHistoricalTextInput(tr: Transaction) {
  return (tr.docChanged || tr.effects.some(effect => effect.is(nativeAnswerPresenceChange))) && Boolean(tr.annotation(Transaction.userEvent)) &&
    tr.annotation(Transaction.addToHistory) !== false && !tr.isUserEvent('undo') && !tr.isUserEvent('redo');
}

function tail<T>(values: readonly T[], size: number) {
  return values.length <= size ? values : size ? values.slice(-size) : [];
}

function updateGroups(value: NativeTextHistoryGroups, tr: Transaction): NativeTextHistoryGroups {
  let { undo, redo, boundary, applicationBoundary } = value;
  if (tr.isUserEvent('undo')) {
    redo = [...redo, ...undo.slice(-1)];
    undo = undo.slice(0, -1);
  } else if (tr.isUserEvent('redo')) {
    undo = [...undo, ...redo.slice(-1)];
    redo = redo.slice(0, -1);
  } else if (isHistoricalTextInput(tr)) {
    // Reading depth evaluates CM's public history field and its join predicate first.
    const depth = undoDepth(tr.state);
    const composeJoin = tr.annotation(Transaction.userEvent) === 'input.type.compose' && undo.length > 0;
    if (!joinedTransactions.has(tr) && !composeJoin) undo = [...undo, {}];
    undo = tail(undo, depth);
    redo = [];
    boundary = false;
  } else if (tr.docChanged) {
    undo = tail(undo, undoDepth(tr.state));
    redo = tail(redo, redoDepth(tr.state));
  }
  for (const effect of tr.effects) {
    if (effect.is(nativeTextHistoryBoundary)) boundary = effect.value;
    if (effect.is(applicationBoundaryEffect) && isHistoricalTextInput(tr)) applicationBoundary = effect.value;
  }
  return undo === value.undo && redo === value.redo && boundary === value.boundary && applicationBoundary === value.applicationBoundary
    ? value : { applicationBoundary, boundary, redo, undo };
}

export const nativeTextHistoryGroups = StateField.define<NativeTextHistoryGroups>({
  create: () => ({ applicationBoundary: null, boundary: false, redo: [], undo: [] }),
  update: updateGroups
});

export const nativeTextHistoryExtensions = [
  invertedEffects.of(tr => tr.effects.flatMap(effect => effect.is(nativeAnswerPresenceChange)
    ? [nativeAnswerPresenceChange.of({ before: effect.value.after, after: effect.value.before })] : [])),
  history({ minDepth: 500, joinToEvent: (tr, adjacent) => {
    if (adjacent) joinedTransactions.add(tr);
    return adjacent;
  } }),
  nativeTextHistoryGroups
];

/** Keep the original transaction opaque so its changes, effects and annotations survive. */
export function nativeTextHistoryInputFilter(getApplicationBoundary: () => object | null = () => null) {
  return EditorState.transactionFilter.of(tr => {
    if ((!tr.docChanged && !tr.effects.some(effect => effect.is(nativeAnswerPresenceChange))) ||
        tr.isUserEvent('undo') || tr.isUserEvent('redo')) return tr;
    if (!tr.annotation(Transaction.userEvent)) return [{ annotations: Transaction.addToHistory.of(false) }, tr];
    if (!isHistoricalTextInput(tr)) return tr;
    const isolation = tr.annotation(isolateHistory);
    const groups = tr.startState.field(nativeTextHistoryGroups);
    const applicationBoundary = getApplicationBoundary();
    const isolatedInput = tr.isUserEvent('input.paste') || tr.isUserEvent('delete.cut') || tr.isUserEvent('input.replace') ||
      tr.startState.selection.ranges.some(range => !range.empty);
    const boundary = groups.boundary || groups.applicationBoundary !== applicationBoundary;
    if (!isolatedInput && !boundary && isolation !== 'before' && isolation !== 'full') return tr;
    return [{
      ...(tr.annotation(Transaction.userEvent) === 'input.type.compose' ? { userEvent: 'input.type.compose.start' } : {}),
      effects: applicationBoundaryEffect.of(applicationBoundary),
      annotations: isolateHistory.of(isolatedInput || isolation === 'after' || isolation === 'full' ? 'full' : 'before')
    }, tr];
  });
}
