import {
  decryptDesktopWorkgroupResponse, encryptDesktopWorkgroupRequest
} from './workgroupHttpCrypto.js';

export function encryptJsonWorkgroupRequest(args: {
  body: string; groupId: string; method: string; pathWithQuery: string;
}) {
  return encryptDesktopWorkgroupRequest({
    ...args, body: Buffer.from(args.body), contentType: 'application/json; charset=utf-8'
  });
}

export function decryptWorkgroupResponse(args: {
  body: Buffer; contentType: string; groupId: string; method: string; pathWithQuery: string;
}) {
  return decryptDesktopWorkgroupResponse(args);
}
