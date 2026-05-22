import type { CommandPaletteItem } from '../../shared/commands/types';
import type { WorkspaceLayoutProps } from '../components/WorkspaceLayout';

import type { ReviewSourceTopicDeleteDialogState } from './appControllerReviewSourceDelete';
import type { AppGoToNodeState } from './appGoToNodeState';
import type { AppHotkeySettings } from './appHotkeySettings';
import type { AppSearchState } from './appSearchState';

export interface AppPaletteState {
  isOpen: boolean;
  items: CommandPaletteItem[];
  recentCommandIds: string[];
  onClose: () => void;
  onRunCommand: (id: string) => void;
}

export interface AppControllerResult {
  hotkeySettings: AppHotkeySettings;
  goToNodeState: AppGoToNodeState;
  moveToNodeState: AppGoToNodeState;
  layoutProps: WorkspaceLayoutProps;
  onOpenCompanionSyncSettings: () => void;
  paletteState: AppPaletteState;
  reviewSourceTopicDeleteDialog: Omit<ReviewSourceTopicDeleteDialogState, 'requestDeleteSourceTopic'>;
  searchState: AppSearchState;
}
