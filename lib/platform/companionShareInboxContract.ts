export type NativeCompanionSharePartKind = 'text' | 'title' | 'url';

export interface NativeCompanionSharePart {
  kind: NativeCompanionSharePartKind;
  value: string;
}

export interface NativeCompanionShareInboxItem {
  delivery_id: string;
  parts: NativeCompanionSharePart[];
  received_at: string;
}

export interface NativeCompanionShareInboxPayload {
  items: NativeCompanionShareInboxItem[];
}

const DELIVERY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function combineNativeCompanionShareParts(parts: NativeCompanionSharePart[]) {
  const values = parts
    .map(part => part.value)
    .filter(value => value.trim().length > 0);
  return [...new Set(values)].join('\n\n');
}

export function isNativeCompanionShareInboxPayload(value: unknown): value is NativeCompanionShareInboxPayload {
  if (!value || typeof value !== 'object' || !Array.isArray((value as NativeCompanionShareInboxPayload).items)) {
    return false;
  }
  return (value as NativeCompanionShareInboxPayload).items.every(item => (
    typeof item.delivery_id === 'string' && DELIVERY_ID_PATTERN.test(item.delivery_id)
    && typeof item.received_at === 'string'
    && Array.isArray(item.parts)
    && item.parts.every(part => (
      ['text', 'title', 'url'].includes(part.kind) && typeof part.value === 'string'
    ))
  ));
}
