export interface RemoteImageResponse {
  status: number;
  location?: string;
  bytesBase64?: string;
}

export interface RemoteImageResourcePlugin {
  readRemoteImageResponse(args: { url: string }): Promise<RemoteImageResponse>;
  writeImageAttachment(args: {
    bytesBase64: string;
    contentHash: string;
    mimeType: string;
    storageKey: string;
  }): Promise<{ storedFile: 'created' | 'reused' }>;
}

export const REMOTE_IMAGE_MAX_BYTES = 32 * 1024 * 1024;
export const REMOTE_IMAGE_MAX_REDIRECTS = 5;
