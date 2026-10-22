type AttachmentPublishedListener = (storageKey: string) => void;

let listener: AttachmentPublishedListener | null = null;

/** Only the desktop shell installs a listener; headless sync and test processes publish silently. */
export function setAttachmentPublishedListener(next: AttachmentPublishedListener | null) {
  listener = next;
}

export function notifyAttachmentPublished(storageKey: string) {
  listener?.(storageKey);
}
