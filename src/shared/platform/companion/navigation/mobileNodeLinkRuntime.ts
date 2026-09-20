import { App } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';

export interface MobileLinkHost {
  addListener(event: 'appUrlOpen', listener: (event: { url: string }) => void): Promise<PluginListenerHandle>;
  getLaunchUrl(): Promise<{ url: string } | undefined>;
}

export function subscribeMobileNodeLinks(
  receive: (url: string) => void,
  report: () => void,
  host: MobileLinkHost = App
): () => void {
  if (host === App && !Capacitor.isNativePlatform()) return () => {};
  let active = true;
  let receivedEvent = false;
  let handle: PluginListenerHandle | undefined;
  void host.addListener('appUrlOpen', ({ url }) => {
    if (!active) return;
    receivedEvent = true;
    receive(url);
  }).then(async (listener) => {
    handle = listener;
    if (!active) { await listener.remove(); return; }
    try {
      const launch = await host.getLaunchUrl();
      if (active && !receivedEvent && launch?.url) receive(launch.url);
    } catch { if (active) report(); }
  }).catch(() => { if (active) report(); });
  return () => {
    active = false;
    void handle?.remove().catch(() => undefined);
  };
}
