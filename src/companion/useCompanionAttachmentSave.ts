import { useLayoutEffect, useRef, useState } from 'react';

import {
  canSaveCompanionAttachment,
  companionPdfStorageKey,
  saveCompanionAttachment
} from '../shared/platform/companion/reading/companionAttachmentSave';

/**
 * Saves one stored attachment to the device through the native save dialog or share sheet.
 * `failed` is cleared whenever the target changes; a stale result never closes the new target's surface.
 */
export function useCompanionAttachmentSave(args: {
  storageKey: string | null | undefined;
  baseName: string | null | undefined;
  fallbackName: string;
  onDone(): void;
}) {
  const current = useRef<object | null>(null);
  const pending = useRef(false);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  useLayoutEffect(() => {
    current.current = {};
    setFailed(false);
    setSaving(false);
    return () => { current.current = null; };
  }, [args.storageKey]);
  const storageKey = args.storageKey;
  if (!storageKey || !canSaveCompanionAttachment()) return undefined;

  async function run() {
    if (pending.current || !storageKey) return;
    pending.current = true;
    setFailed(false);
    setSaving(true);
    const request = current.current;
    const isCurrent = () => request !== null && current.current === request;
    try {
      const status = await saveCompanionAttachment(storageKey, args.baseName, args.fallbackName);
      if (!isCurrent()) return;
      if (status === 'unavailable') setFailed(true);
      else args.onDone();
    } catch {
      if (isCurrent()) setFailed(true);
    } finally {
      pending.current = false;
      if (isCurrent()) setSaving(false);
    }
  }
  return { run, failed, saving };
}

/** Saves the stored original of a PDF topic under the topic title. */
export function useCompanionPdfSave(article: { pdfAttachmentId: string | null; title: string } | null, onDone: () => void) {
  return useCompanionAttachmentSave({
    storageKey: article?.pdfAttachmentId ? companionPdfStorageKey(article.pdfAttachmentId) : null,
    baseName: article?.title,
    fallbackName: 'Document',
    onDone
  });
}
