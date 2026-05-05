import type { NativeInvokeRequest } from '../../lib/platform/nativeContract.js';

export const IPC_INVOKE_CHANNEL = 'foliole:invoke';
export const IPC_MANAGED_INBOX_UPDATED_EVENT_CHANNEL = 'foliole:managed-inbox-updated';
export const IPC_MENU_EVENT_CHANNEL = 'foliole:native-menu-command';
export const IPC_READWISE_BOOK_EPUB_PROGRESS_EVENT_CHANNEL = 'foliole:readwise-book-epub-progress';
export const IPC_WINDOW_RESIZED_EVENT_CHANNEL = 'foliole:window-resized';

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
