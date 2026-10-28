import { Transaction, type EditorState, type Text } from '@codemirror/state';

import { editorHistorySelection } from '../../../../features/editor/model/editorNativeOperationHistory';
import type { EditorTextHistoryInput } from '../../../../features/editor/model/editorOperationHistory';
import { captureNativeTextHistory, runNativeTextHistory } from '../../../../features/editor/model/nativeTextHistory';
import { nativeTextHistoryGroups } from '../../../../features/editor/model/nativeTextHistoryGroups';

type GroupInput = Omit<EditorTextHistoryInput, 'beforeDoc' | 'changes' | 'nativeState' | 'nativeBefore'> & { group: object };

/** Pending native history owns one baseline and one current state, rather than one state per keystroke. */
export class ContentDraftNativeHistory {
  private readonly baseline: Text;
  private state: EditorState;
  private groups: GroupInput[] = [];

  constructor(input: EditorTextHistoryInput) {
    if (!input.nativeState) throw new Error('editor_history_native_input_unavailable');
    this.baseline = input.beforeDoc;
    this.state = input.nativeState;
    this.add(input);
  }

  add(input: EditorTextHistoryInput) {
    if (!input.nativeState) throw new Error('editor_history_native_input_unavailable');
    const nativeGroups = input.nativeState.field(nativeTextHistoryGroups).undo;
    const group = nativeGroups.at(-1);
    if (!group) throw new Error('editor_history_native_group_unavailable');
    const previous = this.groups.at(-1);
    const description: GroupInput = { group, type: input.type, nodeId: input.nodeId, title: input.title,
      timestamp: input.timestamp, userEvent: input.userEvent, afterSelection: input.afterSelection,
      beforeSelection: previous?.group === group ? previous.beforeSelection : input.beforeSelection,
      ...(input.inputOrder === undefined ? {} : { inputOrder: previous?.group === group ? previous.inputOrder ?? input.inputOrder : input.inputOrder }) };
    if (previous?.group === group) this.groups = [...this.groups.slice(0, -1), description];
    else {
      const retained = new Set(nativeGroups);
      this.groups = [...this.groups.filter(item => retained.has(item.group)), description].slice(-500);
    }
    this.state = input.nativeState;
  }

  inputs(): EditorTextHistoryInput[] {
    let state = this.state;
    const inputs: EditorTextHistoryInput[] = [];
    for (const description of [...this.groups].reverse()) {
      while (state.field(nativeTextHistoryGroups).undo.at(-1) !== description.group) {
        const previous = runNativeTextHistory(state, 'undo');
        if (!previous) throw new Error('editor_history_native_group_unavailable');
        state = previous.state;
      }
      const { group, ...metadata } = description;
      const nativeState = captureNativeTextHistory(state.update({ selection: editorHistorySelection(metadata.afterSelection),
        annotations: Transaction.addToHistory.of(false) }).state);
      inputs.unshift({ ...metadata, beforeDoc: this.baseline, nativeState });
      const previous = runNativeTextHistory(state, 'undo', group);
      if (!previous) throw new Error('editor_history_native_group_unavailable');
      state = previous.state;
    }
    return inputs.map((input, index) => index ? { ...input, beforeDoc: inputs[index - 1]!.nativeState!.doc } : input);
  }
}
