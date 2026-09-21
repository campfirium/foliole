import { registerPlugin } from '@capacitor/core';

import type { NativeCompanionShareInboxPayload } from '../../../../lib/platform/companionShareInboxContract';
import { isNativeCompanionShareInboxPayload } from '../../../../lib/platform/companionShareInboxContract';
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
  return payload.items;
}

export function acknowledgeCompanionShare(deliveryId: string) {
  return FolioleCompanionShareInbox.acknowledgeShare({ delivery_id: deliveryId });
}
