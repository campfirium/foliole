import { z } from 'zod';

import type { LocalContentEdit } from '../../lib/core/sync/localContentEdit';

import { createNodeContentPersistQueue } from './nodeContentPersistQueue';
import { continuePendingContentEdit, readContentEditContinuation } from './workspaceContentEditContinuation';

const timestamp = (second: number) => `2026-10-09T01:00:0${second}.000Z`;

export function createSaveQueue(fixture: { right: { invoke(action: string, args: Readonly<Record<string, unknown>>): Promise<unknown> } },
  nodeId: string, initialContent: string) {
  type Save = { edit: LocalContentEdit; content: string; submittedVersionId?: string; inputBaseVersionId: string };
  let result!: { submittedVersionId: string; current: { version_id: string } };
  const queue = createNodeContentPersistQueue({
    delayMs: 0, isBlocked: () => false, readContinuation: readContentEditContinuation,
    continue: continuePendingContentEdit,
    persist: async (save: Save) => {
      result = z.object({ submittedVersionId: z.string(), current: z.object({ version_id: z.string() }) })
        .parse(await fixture.right.invoke('local_content_edit', { ...save.edit, nodeId,
          content: save.content, hostName: 'desktop-b', updatedAt: timestamp(save.content === initialContent ? 1 : 3) }));
      save.submittedVersionId = result.submittedVersionId;
      return true;
    }
  });
  return { queue, result: () => result };
}
