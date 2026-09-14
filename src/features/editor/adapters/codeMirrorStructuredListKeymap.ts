import type { KeyBinding } from '@codemirror/view';

import { cycleListTask } from './codeMirrorListTaskCommands';
import { continueOrExitEmptyList, runListIndent } from './codeMirrorStructuredListCommands';

export const structuredListKeymap: readonly KeyBinding[] = [
  { key: 'Tab', run: (view) => runListIndent(view, false) },
  { key: 'Shift-Tab', run: (view) => runListIndent(view, true) },
  { key: 'Enter', run: continueOrExitEmptyList },
  { key: 'Mod-Enter', run: cycleListTask }
];
