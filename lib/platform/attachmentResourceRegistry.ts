import type { AttachmentResourceDescription } from './attachmentResource.js';

const descriptionsByStorageKey = new Map<string, AttachmentResourceDescription>();

export function registerAttachmentResourceDescriptions(descriptions: AttachmentResourceDescription[]) {
  for (const description of descriptions) descriptionsByStorageKey.set(description.storageKey, description);
}

export function resolveAttachmentResourceDescription(storageKey: string) {
  return descriptionsByStorageKey.get(storageKey) ?? null;
}

export function resolveAttachmentIdByStorageKey(storageKey: string) {
  return resolveAttachmentResourceDescription(storageKey)?.attachmentId ?? null;
}

export function resolveAttachmentResourceDescriptionById(attachmentId: string) {
  return [...descriptionsByStorageKey.values()].find((description) => description.attachmentId === attachmentId) ?? null;
}

export function clearAttachmentResourceDescriptions() {
  descriptionsByStorageKey.clear();
}

export function listAttachmentResourceDescriptions() {
  return [...descriptionsByStorageKey.values()];
}
