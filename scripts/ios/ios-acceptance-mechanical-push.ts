interface PushItem {
  clientOpId?: unknown;
  identity?: { objectId?: unknown; objectType?: unknown; scope?: unknown };
  payloadJson?: unknown;
}

export function acceptIosAcceptancePush(bodyText: string) {
  const payload = JSON.parse(bodyText) as { items?: unknown };
  if (!Array.isArray(payload.items)) throw new Error('invalid_sync_push_payload');
  const items = payload.items.map(readItem);
  return {
    acks: items.map((item, index) => ({
      client_op_id: item.clientOpId,
      identity: item.identity,
      ...(item.identity.objectType === 'node'
        ? { version_id: readNodeVersionId(item.payloadJson) }
        : item.identity.objectType === 'review_log'
          ? {}
          : { state_seq: readStateSeq(item.clientOpId, index) }),
      status: 'accepted' as const
    })),
    items
  };
}

function readItem(value: unknown) {
  const item = value as PushItem;
  const identity = item?.identity;
  if (typeof item?.clientOpId !== 'string' || typeof item.payloadJson !== 'string' ||
      typeof identity?.objectId !== 'string' || typeof identity.objectType !== 'string' ||
      typeof identity.scope !== 'string') {
    throw new Error('invalid_sync_push_payload');
  }
  return { clientOpId: item.clientOpId, identity: {
    objectId: identity.objectId, objectType: identity.objectType, scope: identity.scope
  }, payloadJson: item.payloadJson };
}

function readNodeVersionId(payloadJson: string) {
  const payload = JSON.parse(payloadJson) as { version_id?: unknown };
  if (typeof payload.version_id !== 'string') throw new Error('invalid_sync_push_node_version');
  return payload.version_id;
}

function readStateSeq(clientOpId: string, index: number) {
  const stateSeq = Number(clientOpId.slice(clientOpId.lastIndexOf(':') + 1));
  return Number.isFinite(stateSeq) ? stateSeq : index + 1;
}
