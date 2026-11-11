import { useEffect, useRef } from 'react';

import { createWebDavSendWindow } from '../../lib/core/sync/webDavSendWindow';
import { readNativeAppActiveState, subscribeNativeAppActiveState } from '../shared/platform/appLifecycle';
import { subscribeCompanionWebDavRelay } from '../shared/platform/companion/sync/companionWebDavRelayStore';
import { subscribeCompanionHighValueMutation } from '../shared/platform/companion/sync/mutation/companionSyncMutationRevision';
import { getCompanionRuntimeCapability } from '../shared/platform/companionRuntimeCapabilities';

export function useCompanionWebDavSendWindow(enabled: boolean, send: (signal: AbortSignal, foregroundReceive?: true) => Promise<unknown>, receiveOnForeground = false) {
  const sendRef = useRef(send);
  useEffect(() => { sendRef.current = send; }, [send]);
  useEffect(() => {
    if (!enabled || getCompanionRuntimeCapability().kind !== 'android-native') return;
    const window = createWebDavSendWindow();
    let disposed = false;
    let observedLifecycle = false;
    let unsubscribe: (() => void) | undefined;
    window.start((signal, receive) => receive ? sendRef.current(signal, receive) : sendRef.current(signal), false);
    let wasActive = false;
    const updateActive = (active: boolean) => {
      window.setActive(active);
      if (active && !wasActive && receiveOnForeground) window.foreground();
      wasActive = active;
    };
    const offMutation = subscribeCompanionHighValueMutation(window.request);
    const offBinding = subscribeCompanionWebDavRelay(window.request);
    void subscribeNativeAppActiveState(active => {
      observedLifecycle = true;
      updateActive(active);
    }).then(async off => {
      if (disposed) return off();
      unsubscribe = off;
      const active = await readNativeAppActiveState();
      if (!observedLifecycle && !disposed) updateActive(active);
    }).catch(() => undefined);
    return () => {
      disposed = true;
      window.stop();
      offMutation();
      offBinding();
      unsubscribe?.();
    };
  }, [enabled, receiveOnForeground]);
}
