import type { NativeInvokeRequest } from '../../lib/platform/nativeContract.js';

export const IPC_INVOKE_CHANNEL = 'foliole:invoke';
export const IPC_DIAGNOSTIC_LOG_CHANNEL = 'foliole:diagnostics:log-event';
export const IPC_COMPANION_PAIRING_REQUESTS_CHANGED_CHANNEL = 'foliole:companion-pairing-requests-changed';
export const IPC_MANAGED_INBOX_UPDATED_EVENT_CHANNEL = 'foliole:managed-inbox-updated';
export const IPC_MENU_EVENT_CHANNEL = 'foliole:native-menu-command';
export const IPC_READWISE_BOOK_EPUB_PROGRESS_EVENT_CHANNEL = 'foliole:readwise-book-epub-progress';
export const IPC_WORKSPACE_CONTENT_CHANGED_EVENT_CHANNEL = 'foliole:workspace-content-changed';
export const IPC_WORKSPACE_SYNC_APPLIED_EVENT_CHANNEL = 'foliole:workspace-sync-applied';
export const IPC_WINDOW_RESIZED_EVENT_CHANNEL = 'foliole:window-resized';
export const IPC_HOTKEY_RECORDER_ACTIVE_CHANNEL = 'foliole:hotkey-recorder-active';
export const IPC_NATIVE_KEYBOARD_INPUT_EVENT_CHANNEL = 'foliole:native-keyboard-input';

export const IPC_WINDOW_MINIMIZE_CHANNEL = 'foliole:window:minimize';
export const IPC_WINDOW_TOGGLE_MAXIMIZE_CHANNEL = 'foliole:window:toggle-maximize';
export const IPC_WINDOW_CLOSE_CHANNEL = 'foliole:window:close';
export const IPC_WINDOW_IS_MAXIMIZED_CHANNEL = 'foliole:window:is-maximized';

export interface UnknownInvokeRequest {
  command: string;
  args?: Record<string, unknown>;
}

export type InvokeRequest = NativeInvokeRequest | UnknownInvokeRequest;

export interface MenuCommandEvent {
  commandId: string;
}

export interface NativeKeyboardInputEvent {
  altKey: boolean;
  code: string;
  controlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
  type: string;
}

export interface WorkspaceSyncAppliedEvent {
  appliedNodeIds: string[];
  appliedObjectIds: string[];
  appliedReviewOpIds: string[];
}

export interface WorkspaceContentChangedEvent {
  scope: 'workspace';
}
