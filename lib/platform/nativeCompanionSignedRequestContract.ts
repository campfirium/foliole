export interface NativeCompanionSignedRequestHeaders {
  headers: {
    'X-Authorization-Id': string;
    'X-Nonce': string;
    'X-Signature': string;
    'X-Timestamp': string;
  };
}
