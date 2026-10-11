export const FRAMED_SYNC_PATH = '/companion/framed-sync';
export const FRAMED_SYNC_CONTENT_TYPE = 'application/vnd.foliole.framed-sync';
export const FRAMED_SYNC_BODY_SHA256_HEADER = 'x-foliole-body-sha256';
export const FRAMED_SYNC_LIBRARY_EPOCH_HEADER = 'x-foliole-library-epoch';
export const FRAMED_SYNC_DEVICE_ID_HEADER = 'x-foliole-device-id';
export const FRAMED_SYNC_IDENTITY_PARAMS = Object.freeze({
  initiatorDeviceId: 'initiator_device_id',
  initiatorLibraryEpoch: 'initiator_library_epoch',
  responderDeviceId: 'responder_device_id',
  responderLibraryEpoch: 'responder_library_epoch'
});

export function framedSyncPathWithIdentity(args: Readonly<{
  initiatorDeviceId: string;
  initiatorLibraryEpoch: string;
  pathWithQuery?: string;
  responderDeviceId: string;
  responderLibraryEpoch: string;
}>) {
  const url = new URL(args.pathWithQuery ?? FRAMED_SYNC_PATH, 'http://127.0.0.1');
  url.searchParams.set(FRAMED_SYNC_IDENTITY_PARAMS.initiatorDeviceId, args.initiatorDeviceId);
  url.searchParams.set(FRAMED_SYNC_IDENTITY_PARAMS.initiatorLibraryEpoch, args.initiatorLibraryEpoch);
  url.searchParams.set(FRAMED_SYNC_IDENTITY_PARAMS.responderDeviceId, args.responderDeviceId);
  url.searchParams.set(FRAMED_SYNC_IDENTITY_PARAMS.responderLibraryEpoch, args.responderLibraryEpoch);
  return `${url.pathname}${url.search}`;
}
