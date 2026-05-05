import electron, { type IpcRendererEvent } from 'electron';

import {
  IPC_INVOKE_CHANNEL,
  IPC_MENU_EVENT_CHANNEL,
  IPC_WINDOW_CLOSE_CHANNEL,
  IPC_WINDOW_IS_MAXIMIZED_CHANNEL,
  IPC_WINDOW_MINIMIZE_CHANNEL,
  IPC_WINDOW_RESIZED_EVENT_CHANNEL,
  IPC_WINDOW_TOGGLE_MAXIMIZE_CHANNEL,
  type InvokeRequest,
  type MenuCommandEvent
} from './ipc/contracts.js';

const { contextBridge, ipcRenderer } = electron;

type EventHandler = (...args: unknown[]) => void;

function subscribe(channel: string, handler: EventHandler) {
  if (
    channel !== IPC_MENU_EVENT_CHANNEL &&
    channel !== IPC_WINDOW_RESIZED_EVENT_CHANNEL
  ) {
    return () => undefined;
  }

  const listener = (_: IpcRendererEvent, payload?: unknown) => {
    if (channel === IPC_MENU_EVENT_CHANNEL) {
      handler((payload as MenuCommandEvent | undefined)?.commandId ?? '');
      return;
    }
    handler();
  };

  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const electronAPI = {
  invoke: (command: string, args?: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC_INVOKE_CHANNEL, { command, args } satisfies InvokeRequest),
  on: subscribe,
  windowControls: {
    close: () => ipcRenderer.invoke(IPC_WINDOW_CLOSE_CHANNEL),
    isMaximized: () => ipcRenderer.invoke(IPC_WINDOW_IS_MAXIMIZED_CHANNEL) as Promise<boolean>,
    minimize: () => ipcRenderer.invoke(IPC_WINDOW_MINIMIZE_CHANNEL),
    onResized: (handler: () => void) => subscribe(IPC_WINDOW_RESIZED_EVENT_CHANNEL, handler),
    toggleMaximize: () => ipcRenderer.invoke(IPC_WINDOW_TOGGLE_MAXIMIZE_CHANNEL)
  }
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
