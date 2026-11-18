export const settingsDialogBounds = 'h-[min(860px,calc(100dvh-36px))] w-[min(1240px,calc(100vw-36px))] max-w-none';

export const settingsDialogGrid = `${settingsDialogBounds} grid grid-cols-[260px_minmax(0,1fr)] overflow-hidden`;
export const settingsDialogPane = 'flex min-h-0 min-w-0 flex-col bg-settings-group';
export const settingsDialogPaneHeader = 'flex h-settings-navigation-header shrink-0 items-center border-b border-settings-divider/55 px-7';
export const settingsDialogPaneBody = 'app-scrollbar min-h-0 flex-1 scroll-pt-20 overflow-auto px-7 py-7';
