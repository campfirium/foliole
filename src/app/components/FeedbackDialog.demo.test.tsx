import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { HTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { preloadTranslationCatalog } from '../../shared/localization/translations';
import { installDemoRuntimeController } from '../../shared/platform/runtime/demoRuntime';

vi.mock('../../shared/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/ui')>();
  return {
    ...actual,
    AppDialog: ({ children }: { children: ReactNode }) => <>{children}</>,
    AppDialogContent: ({ children, className, ...props }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) => (
      <div className={className} role="dialog" {...props}>{children}</div>
    ),
    AppDialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
    AppDialogOverlay: () => null,
    AppDialogPortal: ({ children }: { children: ReactNode }) => <>{children}</>,
    AppDialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>
  };
});

import { FeedbackDialog } from './FeedbackDialog';

afterEach(() => {
  installDemoState(false);
  vi.unstubAllGlobals();
});

beforeAll(async () => {
  await preloadTranslationCatalog('en');
});

function installDemoState(isDemo: boolean) {
  const state = {
    clearError: null,
    importError: null,
    importedTopicCount: 0,
    isDemo,
    manualAdvanceDays: 0,
    previewDay: 0,
    startedAt: null
  };
  installDemoRuntimeController({
    clearLocalData: () => Promise.resolve(false),
    continueToNextPreviewDay: () => undefined,
    getNowIso: (realNow) => realNow.toISOString(),
    getState: () => state,
    importMarkdown: () => Promise.resolve({ ignoredCount: 0, importedTopicCount: 0 }),
    subscribe: () => () => undefined
  });
}

describe('FeedbackDialog demo metadata', () => {
  it('marks demo feedback submissions as the demo platform', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    installDemoState(true);
    renderWithLocalization(<FeedbackDialog endpoint="https://feedback.example.test" onClose={() => undefined} open />);

    fireEvent.change(screen.getByLabelText('Feedback'), { target: { value: 'This came from the public demo.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const requestInit = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)[0]?.[1];
    expect(JSON.parse(requestInit?.body as string)).toMatchObject({
      metadata: { language: 'en', platform: 'demo' }
    });
  });
});
