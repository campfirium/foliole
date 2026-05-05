const { contextBridge, ipcRenderer } = require('electron');

const IPC_INVOKE_CHANNEL = 'foliole:invoke';
const IPC_MENU_EVENT_CHANNEL = 'foliole:native-menu-command';
const IPC_WINDOW_RESIZED_EVENT_CHANNEL = 'foliole:window-resized';
const IPC_WINDOW_MINIMIZE_CHANNEL = 'foliole:window:minimize';
const IPC_WINDOW_TOGGLE_MAXIMIZE_CHANNEL = 'foliole:window:toggle-maximize';
const IPC_WINDOW_CLOSE_CHANNEL = 'foliole:window:close';
const IPC_WINDOW_IS_MAXIMIZED_CHANNEL = 'foliole:window:is-maximized';

function subscribe(channel, handler) {
  if (channel !== IPC_MENU_EVENT_CHANNEL && channel !== IPC_WINDOW_RESIZED_EVENT_CHANNEL) {
    return () => undefined;
  }

  const listener = (_event, payload) => {
    if (channel === IPC_MENU_EVENT_CHANNEL) {
      handler(payload?.commandId ?? '');
      return;
    }
    handler();
  };

  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (command, args) => ipcRenderer.invoke(IPC_INVOKE_CHANNEL, { command, args }),
  on: subscribe,
  windowControls: {
    close: () => ipcRenderer.invoke(IPC_WINDOW_CLOSE_CHANNEL),
    isMaximized: () => ipcRenderer.invoke(IPC_WINDOW_IS_MAXIMIZED_CHANNEL),
    minimize: () => ipcRenderer.invoke(IPC_WINDOW_MINIMIZE_CHANNEL),
    onResized: (handler) => subscribe(IPC_WINDOW_RESIZED_EVENT_CHANNEL, handler),
    toggleMaximize: () => ipcRenderer.invoke(IPC_WINDOW_TOGGLE_MAXIMIZE_CHANNEL)
  }
});
