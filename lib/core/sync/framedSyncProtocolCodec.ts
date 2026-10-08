import protobuf from 'protobufjs';

import { assertDecodedProtocolPayload } from './framedSyncDecodedContract.js';
import { streamFactProtocolEncoding } from './framedSyncFactEncoding.js';
import {
  assertDecodedPayloadType,
  type ProtocolPayloadCase
} from './framedSyncReceiver.js';
import schema from './generated/framed-sync-v22-schema.json' with { type: 'json' };

const root = protobuf.Root.fromJSON(schema as protobuf.INamespace);
const protocolMessage = root.lookupType('foliole.sync.v22.ProtocolMessage');

const PAYLOAD_PROPERTIES = Object.freeze({
  blob_chunk: 'blobChunk',
  blob_offer: 'blobOffer',
  difference_request: 'differenceRequest',
  error: 'error',
  fact: 'fact',
  fact_fragment: 'factFragment',
  handshake: 'handshake',
  handshake_acceptance: 'handshakeAcceptance',
  inventory_begin: 'inventoryBegin',
  inventory_chunk: 'inventoryChunk',
  inventory_end: 'inventoryEnd',
  missing_blob_set: 'missingBlobSet',
  round_receipt: 'roundReceipt',
  transfer_header: 'transferHeader',
  transfer_proposal: 'transferProposal',
  transfer_receipt: 'transferReceipt',
  transfer_termination: 'transferTermination',
  transfer_trailer: 'transferTrailer'
} satisfies Record<ProtocolPayloadCase, string>);

const validatedProtocolMessageBrand: unique symbol = Symbol('validatedProtocolMessage');

export type ValidatedProtocolMessage<C extends ProtocolPayloadCase = ProtocolPayloadCase> = Readonly<{
  [validatedProtocolMessageBrand]: true;
  payload: Readonly<Record<string, unknown>>;
  payloadCase: C;
}>;

function validated<C extends ProtocolPayloadCase>(
  payloadCase: C,
  payload: unknown
): ValidatedProtocolMessage<C> {
  assertDecodedProtocolPayload(payloadCase, payload);
  return {
    [validatedProtocolMessageBrand]: true,
    payload: payload as Readonly<Record<string, unknown>>,
    payloadCase
  };
}

export function decodeAndValidateProtocolMessage(
  encoded: Uint8Array,
  authenticatedFrameType: number
): ValidatedProtocolMessage {
  const decoded = protocolMessage.toObject(protocolMessage.decode(encoded), {
    arrays: true,
    defaults: true,
    longs: String
  }) as Record<string, unknown>;
  const selected = (Object.entries(PAYLOAD_PROPERTIES) as [ProtocolPayloadCase, string][])
    .filter(([, property]) => decoded[property] !== undefined && decoded[property] !== null);
  if (selected.length !== 1) throw new Error('protocol_payload_case_invalid');
  const [payloadCase, property] = selected[0]!;
  assertDecodedPayloadType(authenticatedFrameType, payloadCase);
  return validated(payloadCase, decoded[property]);
}

export function encodeValidatedProtocolMessage(
  payloadCase: ProtocolPayloadCase,
  payload: unknown
) {
  return protocolMessage.encode(protocolValue(payloadCase, payload)).finish();
}

/** Each transfer owns an encoder. Its bytes are borrowed until its next encode. */
export function createFramedSyncProtocolEncoder() {
  const writer: protobuf.Writer = protobuf.Writer.create();
  return (payloadCase: ProtocolPayloadCase, payload: unknown) =>
    protocolMessage.encode(protocolValue(payloadCase, payload), writer.reset()).finish(true);
}

/** Yields standard protobuf bytes without allocating the complete fact encoding. */
export function* streamValidatedFactProtocolMessage(payload: unknown): Generator<Uint8Array> {
  yield* streamFactProtocolEncoding(protocolMessage, protocolValue('fact', payload));
}

function protocolValue(payloadCase: ProtocolPayloadCase, payload: unknown) {
  validated(payloadCase, payload);
  const value = { [PAYLOAD_PROPERTIES[payloadCase]]: payload };
  const error = protocolMessage.verify(value);
  if (error) throw new Error(`protocol_encode_invalid:${error}`);
  return protocolMessage.create(value);
}
