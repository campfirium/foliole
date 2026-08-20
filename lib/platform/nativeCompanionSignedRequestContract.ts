export interface NativeCompanionSignedRequestHeaders {
  body?: string;
  headers: {
    'X-Authorization-Id': string;
    'X-Nonce': string;
    'X-Signature': string;
    'X-Timestamp': string;
  };
}
