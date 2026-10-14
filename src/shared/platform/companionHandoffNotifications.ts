import { LocalNotifications } from '@capacitor/local-notifications';

import { isNativeCompanionRuntime } from './companionBootstrap';

export async function cancelRetiredHandoffNotifications() {
  if (!isNativeCompanionRuntime()) return;
  await LocalNotifications.cancel({ notifications: [{ id: 420101 }, { id: 420102 }] });
}
