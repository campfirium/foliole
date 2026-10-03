import { App } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';

export interface AndroidBackHost {
  addListener(event: 'backButton', listener: () => void): Promise<PluginListenerHandle>;
  exitApp(): Promise<void>;
}

export function subscribeAndroidBack(handler: () => void, host: AndroidBackHost = App): () => void {
  if (host === App && Capacitor.getPlatform() !== 'android') return () => undefined;
  let active = true;
  let listener: PluginListenerHandle | undefined;
  void host.addListener('backButton', () => { if (active) handler(); }).then((handle) => {
    listener = handle;
    if (!active) void handle.remove();
  }).catch(() => undefined);
  return () => {
    active = false;
    if (listener) void listener.remove();
  };
}

export function exitAndroidApp(): void {
  void App.exitApp();
}
