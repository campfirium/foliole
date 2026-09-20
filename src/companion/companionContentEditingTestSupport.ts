import { vi } from 'vitest';

import type { CompanionContentAcknowledgement, CompanionContentEdit, CompanionContentSource } from '../shared/platform/companion/editing/companionContentEditContract';

export function createContentSaveMock(initial: CompanionContentSource = { content: 'Original body', versionId: 'base' }) {
  let source = initial;
  const save = vi.fn(async (_nodeId: string, content: string, edit?: CompanionContentEdit): Promise<CompanionContentAcknowledgement> => {
    source = { content, versionId: edit?.versionId ?? 'saved' };
    return { content, currentVersionId: source.versionId, submittedVersionId: source.versionId };
  });
  return Object.assign(save, {
    readSource: vi.fn(async () => source),
    setSource: (next: CompanionContentSource) => { source = next; }
  });
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
