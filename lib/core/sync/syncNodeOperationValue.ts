import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

type OperationSource = Pick<NativeSyncNodeRecord, 'version_created_at' | 'version_id'>;

export function selectNodeOperationValue<T, S extends OperationSource>(
  base: T | undefined, current: { source: S; value: T }, incomingValue: T, incoming: S
) {
  if (base !== undefined) {
    if (current.value === base && incomingValue !== base) return { value: incomingValue, source: incoming };
    if (incomingValue === base) return current;
  }
  const currentKey = `${current.source.version_created_at ?? ''}\n${current.source.version_id ?? ''}`;
  const incomingKey = `${incoming.version_created_at ?? ''}\n${incoming.version_id ?? ''}`;
  return incomingKey > currentKey ? { value: incomingValue, source: incoming } : current;
}
