export type FramedWireFrame = Readonly<{
  ciphertext: Uint8Array;
  frameHeader: Uint8Array;
  preamble: Uint8Array;
  sequence: bigint;
}>;

export type AuthenticatedStagedFrame = FramedWireFrame & Readonly<{
  plaintext: Uint8Array;
}>;

export type FramedTransportFault =
  | Readonly<{ frameIndex: number; kind: 'authentication_failure' }>
  | Readonly<{ frameIndex: number; kind: 'duplicate_frame' }>
  | Readonly<{ firstFrameIndex: number; kind: 'reorder_frames'; secondFrameIndex: number }>
  | Readonly<{ afterDeliveryIndex: number; kind: 'process_restart' }>
  | Readonly<{ frameIndex: number; kind: 'truncate_frame'; retainedCiphertextBytes: number }>
  | Readonly<{ kind: 'ack_loss' }>;

export type FramedTransportEvent =
  | Readonly<{ frame: FramedWireFrame; kind: 'deliver_frame' }>
  | Readonly<{ kind: 'restart_process' }>;

export type FaultedTransport = Readonly<{
  ackDelivery: 'deliver' | 'drop';
  events: readonly FramedTransportEvent[];
}>;

export type FramedTransportCounts = Readonly<{
  authenticatedFrames: number;
  deliveryAttempts: number;
  duplicateFrames: number;
  rejectedFrames: number;
  receiptCommits: number;
  receiptReplays: number;
  restarts: number;
  stagedFrames: number;
}>;

export type FramedTransportResult = Readonly<{
  ackDelivered: boolean;
  counts: FramedTransportCounts;
  error: string | null;
  receiptCommitted: boolean;
  stagedSequences: readonly bigint[];
}>;
