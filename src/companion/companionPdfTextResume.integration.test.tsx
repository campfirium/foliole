import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState';
import { applyReadingResumeRecord } from '../../lib/core/sync/readingResumeApply';
import { advanceReadingResume } from '../../lib/core/sync/readingResumeState';
import { encodePdfReadingPosition, pdfReadingContentHash } from '../../lib/platform/pdfReadingPosition';
import { CodeMirrorEditorNavigation } from '../features/editor/adapters/codeMirrorEditorNavigation';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import { saveCompanionSyncNodeViewState } from '../shared/platform/companionSyncObjects';
import { createResumeLibrary } from '../test/companionNavigationResume.testSupport';

import { ReadableArticleDocument } from './CompanionReadableArticleDocument';
import { useCompanionReadableArticleLoader } from './useCompanionReadableArticleLoader';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false },
    registerPlugin: createCompanionNativeSyncStub };
});
vi.mock('../shared/platform/appLifecycle', () => ({
  subscribeNativeAppBackground: async () => () => {}, subscribeNativeAppForeground: async () => () => {}
}));

const attachment = 'a'.repeat(64);
const firstPage = 'First page 中文 📝';
const thirdPage = 'Third page of the original';

function seedPdf(library: Awaited<ReturnType<typeof createResumeLibrary>>, body: string) {
  library.database.prepare("UPDATE nodes SET content = ?, resource_references = ? WHERE id = 'article'")
    .run(body, JSON.stringify([{ storage_key: `${attachment}.pdf`, role: 'reference', original_name: 'Original.pdf' }]));
  const addPage = library.database.prepare('INSERT INTO pdf_page_text(attachment_id,page,text) VALUES (?,?,?)');
  addPage.run(attachment, 1, firstPage);
  addPage.run(attachment, 2, ' ');
  addPage.run(attachment, 3, thirdPage);
}

async function receivePosition(page: number, attachmentId = attachment) {
  const payload = advanceReadingResume(null, pdfReadingContentHash(attachmentId), 'desktop', encodePdfReadingPosition(page, 0.75));
  await getIosCompanionDatabaseOwner().runWriter(db => applyReadingResumeRecord(db, {
    content_hash: computeSyncContentHash('node_reading_resume', payload), object_id: 'article',
    deleted_at: null, object_type: 'node_reading_resume', payload_json: JSON.stringify(payload),
    updated_at: '2026-11-11T00:00:00Z'
  }));
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it.each([
  { body: '# Article\n\nLinked PDF source ready for the reader surface.', page: 3, matches: true },
  { body: '# Article\n\nLinked PDF source ready for the reader surface.', page: 2, matches: false },
  { body: '# Article\n\nLinked PDF source ready for the reader surface.', page: 3, attachmentId: 'b'.repeat(64), matches: false },
  { body: '# Article\n\nLinked PDF source ready for the reader surface.', page: 3, localScroll: 680, matches: false },
  { body: '# Article\n\nIndependently edited reading version', page: 3, matches: false }
])('opens only the exact projected PDF page in the mobile text ($page, $matches)', async scenario => {
  const library = await createResumeLibrary();
  try {
    seedPdf(library, scenario.body);
    await receivePosition(scenario.page, scenario.attachmentId);
    if (scenario.localScroll) await saveCompanionSyncNodeViewState({ nodeId: 'article', scrollTop: scenario.localScroll });
    const snapshot = await library.reopen();
    const view = renderHook(() => {
      const [, setArticle] = useState<CompanionReadableArticle | null>(null);
      return useCompanionReadableArticleLoader(snapshot, setArticle);
    });
    await act(async () => { await view.result.current.openReadableArticle('article'); });
    const article = view.result.current.readableArticle;
    expect(article?.nodeId).toBe('article');
    if (!scenario.matches) {
      expect(article?.pdfResumeTextOffset).toBeUndefined();
      if (scenario.localScroll) expect(article?.persistedNodeViewState?.scrollTop).toBe(scenario.localScroll);
      return;
    }
    expect(article!.content.slice(article!.pdfResumeTextOffset)).toBe(thirdPage);
    const reveal = vi.spyOn(CodeMirrorEditorNavigation.prototype, 'revealReadingPosition');
    render(<LocalizationProvider><MouseGestureSettingsProvider>
      <ReadableArticleDocument readableArticle={article!} scrollContainer="outer" readingTypographySettings={{
        contrast: 'default', fontFamily: 'sans', fontSize: 'default', lineHeight: 'default',
        paragraphSpacing: 0.35, fontWeight: 400, textWidth: 100
      }} />
    </MouseGestureSettingsProvider></LocalizationProvider>);
    await waitFor(() => expect(reveal).toHaveBeenCalledWith(article!.pdfResumeTextOffset));
  } finally {
    cleanup();
    await library.close();
  }
});
