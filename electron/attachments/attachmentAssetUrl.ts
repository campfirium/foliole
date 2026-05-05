export const ATTACHMENT_PROTOCOL_SCHEME = 'foliole-asset';
const ATTACHMENT_PROTOCOL_HOST = 'attachment';

export function buildAttachmentAssetUrl(attachmentId: string) {
  return `${ATTACHMENT_PROTOCOL_SCHEME}://${ATTACHMENT_PROTOCOL_HOST}/${encodeURIComponent(attachmentId)}`;
}

export function parseAttachmentAssetUrl(requestUrl: string) {
  try {
    const parsedUrl = new URL(requestUrl);
    if (parsedUrl.protocol !== `${ATTACHMENT_PROTOCOL_SCHEME}:` || parsedUrl.host !== ATTACHMENT_PROTOCOL_HOST) {
      return null;
    }
    const attachmentId = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, '').trim());
    return attachmentId || null;
  } catch {
    return null;
  }
}
