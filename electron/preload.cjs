const { contextBridge, ipcRenderer } = require('electron');

const IPC_INVOKE_CHANNEL = 'foliole:invoke';
const IPC_MENU_EVENT_CHANNEL = 'foliole:native-menu-command';
const IPC_WINDOW_RESIZED_EVENT_CHANNEL = 'foliole:window-resized';

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
  onNativeMenuCommand: (handler) => subscribe(IPC_MENU_EVENT_CHANNEL, handler),
  onWindowResized: (handler) => subscribe(IPC_WINDOW_RESIZED_EVENT_CHANNEL, handler)
});
