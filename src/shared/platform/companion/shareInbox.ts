import { registerPlugin } from '@capacitor/core';

import type { NativeCompanionShareInboxPayload } from '../../../../lib/platform/companionShareInboxContract';
import { hasNativeCompanionShareText, isNativeCompanionShareInboxPayload } from '../../../../lib/platform/companionShareInboxContract';
import { requireCompanionNativePlugin } from '../companionRuntimeCapabilities';

interface CompanionShareInboxPlugin {
  acknowledgeShare(args: { delivery_id: string }): Promise<void>;
  addListener(
    eventName: 'shareInboxChanged',
    listener: () => void
  ): Promise<import('@capacitor/core').PluginListenerHandle>;
  loadPendingShares(): Promise<NativeCompanionShareInboxPayload>;
}

export const FolioleCompanionShareInbox = registerPlugin<CompanionShareInboxPlugin>('FolioleCompanionShareInbox');

export async function loadPendingCompanionShares() {
  requireCompanionNativePlugin('share-inbox', 'FolioleCompanionShareInbox');
  const payload: unknown = await FolioleCompanionShareInbox.loadPendingShares();
  if (!isNativeCompanionShareInboxPayload(payload)) {
    throw new Error('Native companion share inbox returned an invalid payload.');
  }
  const pending = [];
  for (const item of payload.items) {
    // Older hosts could queue text that trims to empty. Retire the empty delivery
    // so it cannot block valid shares behind it.
    if (hasNativeCompanionShareText(item.parts)) pending.push(item);
    else await acknowledgeCompanionShare(item.delivery_id);
  }
  return pending;
}

export function acknowledgeCompanionShare(deliveryId: string) {
  return FolioleCompanionShareInbox.acknowledgeShare({ delivery_id: deliveryId });
}
