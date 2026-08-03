import { App } from '@capacitor/app';

import { isNativeCompanionRuntime } from './companionBootstrap';

type Unsubscribe = () => void;

export async function readNativeAppActiveState() {
  if (!isNativeCompanionRuntime()) {
    return true;
  }
  return (await App.getState()).isActive;
}

async function toUnsubscribe(handlePromise: Promise<{ remove: () => Promise<void> }>) {
  const handle = await handlePromise;
  return () => {
    void handle.remove();
  };
}

export async function subscribeNativeAppForeground(handler: () => void): Promise<Unsubscribe> {
  if (!isNativeCompanionRuntime()) {
    return () => undefined;
  }

  const unsubscribes = await Promise.all([
    toUnsubscribe(
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          handler();
        }
      })
    ),
    toUnsubscribe(
      App.addListener('resume', () => {
        handler();
      })
    )
  ]);

  return () => {
    for (const unsubscribe of unsubscribes) {
      unsubscribe();
    }
  };
}

export async function subscribeNativeAppBackground(handler: () => void): Promise<Unsubscribe> {
  if (!isNativeCompanionRuntime()) {
    return () => undefined;
  }

  const unsubscribes = await Promise.all([
    toUnsubscribe(
      App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          handler();
        }
      })
    ),
    toUnsubscribe(App.addListener('pause', handler))
  ]);

  return () => {
    for (const unsubscribe of unsubscribes) {
      unsubscribe();
    }
  };
}
