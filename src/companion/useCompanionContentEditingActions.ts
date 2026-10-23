import { flushSync } from 'react-dom';

import type { CompanionReadingActivity } from './companionReadingActivity';
import { useCompanionContentEditCancel } from './useCompanionContentEditCancel';

/** Enters, finishes and cancels one editing round of the reading surface. */
export function useCompanionContentEditingActions(args: {
  activity: CompanionReadingActivity | undefined;
  editing: boolean;
  enter(): void;
  exit(): void;
  focusEditor(): void;
  prepareEnter(): void;
}) {
  const { activity } = args;
  function finishContentEditing() {
    args.exit();
    activity?.setEditing(false);
    activity?.editRound?.end();
  }
  const cancelContentEditing = useCompanionContentEditCancel(activity, finishContentEditing);
  async function toggleContentEditing() {
    if (args.editing) {
      try { await activity?.flush(); } catch { return; }
      finishContentEditing();
      return;
    }
    args.prepareEnter();
    flushSync(() => {
      args.enter();
      activity?.setEditing(true);
    });
    activity?.editRound?.begin();
    args.focusEditor();
  }
  return { cancelContentEditing, toggleContentEditing };
}
