import {
  assertFramedSyncDigest,
  FRAMED_SYNC_PROTOCOL_VERSION,
  type FramedSyncContext,
  type PublishedTransfer
} from './framedSyncContract.js';
import {
  isTransferPayloadCase,
  sessionPayload,
  transferPayload,
  type SessionBoundPayload,
  type TransferBoundPayload
} from './framedSyncEnvelopePayload.js';
import type { FramedSyncPreamble } from './framedSyncFraming.js';
import type { ValidatedProtocolMessage } from './framedSyncProtocolCodec.js';
import {
  assertAuthenticatedSessionBootstrap,
  type FramedSyncSessionContext
} from './framedSyncSession.js';

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((byte, index) => right[index] === byte);
}

function assertBytes(left: Uint8Array, right: Uint8Array, error: string) {
  if (!sameBytes(left, right)) throw new Error(error);
}

function assertContextIdentity(payload: Extract<SessionBoundPayload, { case: 'proposal' }>, context: FramedSyncContext) {
  if (payload.senderDeviceId !== context.senderDeviceId ||
      payload.senderLibraryEpoch !== context.senderLibraryEpoch ||
      payload.receiverDeviceId !== context.receiverDeviceId ||
      payload.receiverLibraryEpoch !== context.receiverLibraryEpoch) {
    throw new Error('transfer_endpoint_identity_mismatch');
  }
}

function assertSessionTransferParticipants(
  session: Omit<FramedSyncSessionContext, 'sessionId'>,
  published: PublishedTransfer
) {
  const transfer = published.context;
  const forward = session.initiatorDeviceId === transfer.senderDeviceId &&
    session.initiatorLibraryEpoch === transfer.senderLibraryEpoch &&
    session.responderDeviceId === transfer.receiverDeviceId &&
    session.responderLibraryEpoch === transfer.receiverLibraryEpoch;
  const reverse = session.initiatorDeviceId === transfer.receiverDeviceId &&
    session.initiatorLibraryEpoch === transfer.receiverLibraryEpoch &&
    session.responderDeviceId === transfer.senderDeviceId &&
    session.responderLibraryEpoch === transfer.senderLibraryEpoch;
  if (session.groupId !== transfer.groupId || (!forward && !reverse)) {
    throw new Error('session_transfer_participant_mismatch');
  }
}

function assertBoundTransferPayload(
  published: PublishedTransfer,
  preamble: FramedSyncPreamble,
  payload: TransferBoundPayload
) {
  if (preamble.contextKind !== 'transfer') throw new Error('transfer_preamble_required');
  assertBytes(preamble.contextId, published.transferId, 'transfer_preamble_identity_mismatch');
  assertBytes(payload.transferId, published.transferId, 'transfer_payload_identity_mismatch');
  if (payload.case === 'fact' || payload.case === 'blob_chunk') return;
  if (payload.case === 'header') {
    assertBytes(payload.attemptId, preamble.attemptId, 'transfer_attempt_identity_mismatch');
    if (payload.protocolVersion !== FRAMED_SYNC_PROTOCOL_VERSION ||
        payload.groupId !== published.context.groupId) throw new Error('transfer_manifest_context_mismatch');
    assertBytes(payload.contentId, published.contentId, 'transfer_content_identity_mismatch');
  } else if (payload.case === 'receipt') {
    if (payload.receiverDeviceId !== published.context.receiverDeviceId ||
        payload.receiverLibraryEpoch !== published.context.receiverLibraryEpoch) {
      throw new Error('transfer_receipt_identity_mismatch');
    }
    assertBytes(payload.contentId, published.contentId, 'transfer_content_identity_mismatch');
    assertFramedSyncDigest(payload.appliedStateHash, 'applied_state_hash');
    return;
  }
  if (payload.case === 'header' || payload.case === 'trailer') {
    if (payload.factCount !== published.factCount || payload.blobCount !== published.blobCount) {
      throw new Error('transfer_count_mismatch');
    }
  }
  if (payload.case === 'header') {
    if (payload.totalBlobBytes !== published.totalBlobBytes) throw new Error('transfer_blob_total_mismatch');
  }
  if (payload.case === 'trailer') {
    assertBytes(payload.manifestHash, published.manifestHash, 'transfer_manifest_hash_mismatch');
  }
}

function assertTerminationAcknowledgement(
  authenticatedHttpContext: Omit<FramedSyncSessionContext, 'sessionId'>,
  published: PublishedTransfer,
  payload: Extract<SessionBoundPayload, { case: 'transfer_termination' }>,
  messageAuthorDeviceId: string
) {
  assertBytes(payload.transferId, published.transferId, 'transfer_payload_identity_mismatch');
  const authorIsAuthenticated = messageAuthorDeviceId === authenticatedHttpContext.initiatorDeviceId ||
    messageAuthorDeviceId === authenticatedHttpContext.responderDeviceId;
  if (!payload.acknowledged || !authorIsAuthenticated ||
      messageAuthorDeviceId !== published.context.receiverDeviceId ||
      payload.memberId !== published.context.receiverDeviceId) {
    throw new Error('termination_acknowledgement_invalid');
  }
}

async function assertBoundSessionPayload(
  authenticatedHttpContext: Omit<FramedSyncSessionContext, 'sessionId'>,
  preamble: FramedSyncPreamble,
  payload: SessionBoundPayload,
  published?: PublishedTransfer
) {
  const context = await assertAuthenticatedSessionBootstrap(authenticatedHttpContext, preamble);
  if (payload.case === 'control') return context;
  if (payload.case === 'proposal') {
    if (!published) throw new Error('session_transfer_reference_required');
    assertSessionTransferParticipants(authenticatedHttpContext, published);
    assertBytes(payload.transferId, published.transferId, 'transfer_payload_identity_mismatch');
    assertBytes(payload.contentId, published.contentId, 'transfer_content_identity_mismatch');
    assertContextIdentity(payload, published.context);
    if (payload.factCount !== published.factCount || payload.blobCount !== published.blobCount) {
      throw new Error('transfer_count_mismatch');
    }
    if (payload.totalBlobBytes !== published.totalBlobBytes) throw new Error('transfer_blob_total_mismatch');
    return context;
  }
  if (payload.case === 'protocol_error') {
    if (payload.transferId === null) return context;
    if (!published) throw new Error('session_transfer_reference_required');
    assertSessionTransferParticipants(authenticatedHttpContext, published);
    assertBytes(payload.transferId, published.transferId, 'transfer_payload_identity_mismatch');
    return context;
  }
  if ('transferId' in payload) {
    if (!published) throw new Error('session_transfer_reference_required');
    assertSessionTransferParticipants(authenticatedHttpContext, published);
    assertBytes(payload.transferId, published.transferId, 'transfer_payload_identity_mismatch');
    if (payload.case === 'transfer_termination' &&
        payload.memberId !== published.context.receiverDeviceId) {
      throw new Error('termination_member_identity_mismatch');
    }
    return context;
  }
  if (payload.protocolVersion !== FRAMED_SYNC_PROTOCOL_VERSION) {
    throw new Error('session_payload_protocol_mismatch');
  }
  assertBytes(payload.sessionId, context.sessionId, 'session_payload_identity_mismatch');
  if (payload.case === 'handshake' && (payload.groupId !== context.groupId ||
      payload.deviceId !== context.initiatorDeviceId ||
      payload.libraryEpoch !== context.initiatorLibraryEpoch)) {
    throw new Error('session_handshake_identity_mismatch');
  }
  return context;
}

export function assertTransferEnvelopeBinding(
  published: PublishedTransfer,
  preamble: FramedSyncPreamble,
  message: ValidatedProtocolMessage,
  messageAuthorDeviceId: string
) {
  if (!isTransferPayloadCase(message.payloadCase)) throw new Error('transfer_payload_required');
  const expectedAuthor = message.payloadCase === 'transfer_receipt'
    ? published.context.receiverDeviceId
    : published.context.senderDeviceId;
  if (messageAuthorDeviceId !== expectedAuthor) throw new Error('transfer_message_author_mismatch');
  assertBoundTransferPayload(published, preamble, transferPayload(message, published));
}

export async function assertSessionEnvelopeBinding(
  authenticatedHttpContext: Omit<FramedSyncSessionContext, 'sessionId'>,
  preamble: FramedSyncPreamble,
  message: ValidatedProtocolMessage,
  messageAuthorDeviceId: string,
  published?: PublishedTransfer,
  durableTerminationRequestObserved = false
) {
  const payload = sessionPayload(message);
  const authenticated = messageAuthorDeviceId === authenticatedHttpContext.initiatorDeviceId ||
    messageAuthorDeviceId === authenticatedHttpContext.responderDeviceId;
  if (!authenticated) throw new Error('session_message_author_mismatch');
  if (payload.case === 'proposal' || payload.case === 'blob_offer') {
    if (!published || messageAuthorDeviceId !== published.context.senderDeviceId) {
      throw new Error('session_message_author_mismatch');
    }
  } else if (payload.case === 'missing_blob_set') {
    if (!published || messageAuthorDeviceId !== published.context.receiverDeviceId) {
      throw new Error('session_message_author_mismatch');
    }
  } else if (payload.case === 'transfer_termination') {
    if (!published) throw new Error('session_transfer_reference_required');
    const expectedAuthor = payload.acknowledged
      ? published.context.receiverDeviceId
      : published.context.senderDeviceId;
    if (messageAuthorDeviceId !== expectedAuthor) throw new Error('session_message_author_mismatch');
    if (payload.acknowledged) {
      if (!durableTerminationRequestObserved) throw new Error('termination_request_not_durable');
      assertTerminationAcknowledgement(
        authenticatedHttpContext, published, payload, messageAuthorDeviceId
      );
    }
  }
  return assertBoundSessionPayload(authenticatedHttpContext, preamble, payload, published);
}
