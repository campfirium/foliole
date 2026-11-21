import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { HTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';

import { FeedbackDialog } from '../../shared/feedback/FeedbackDialog';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { preloadTranslationCatalog } from '../../shared/localization/translations';

const { isDesktopRuntime, loadRecentErrorSummary } = vi.hoisted(() => ({
  isDesktopRuntime: vi.fn(() => true),
  loadRecentErrorSummary: vi.fn<() => Promise<string | null>>()
}));

vi.mock('../../shared/platform/runtime', () => ({ isDesktopRuntime }));
vi.mock('../../shared/platform/diagnosticBundle', () => ({ loadRecentErrorSummary }));
vi.mock('../../shared/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/ui')>();
  return {
    ...actual,
    AppDialog: ({ children }: { children: ReactNode }) => <>{children}</>,
    AppDialogContent: ({ children, ...props }: { children: ReactNode } & HTMLAttributes<HTMLDivElement>) => (
      <div role="dialog" {...props}>{children}</div>
    ),
    AppDialogOverlay: () => null,
    AppDialogPortal: ({ children }: { children: ReactNode }) => <>{children}</>,
    AppDialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>
  };
});

const SUMMARY = 'Platform: darwin 25.6.0\n- 2026-11-21T05:38:32.590Z electron.main: native_command_failed error="Error EPERM: operation not permitted"';
const LABEL = 'Include recent error details (personal details removed)';

beforeAll(async () => {
  await preloadTranslationCatalog('en');
});

beforeEach(() => {
  isDesktopRuntime.mockReturnValue(true);
  loadRecentErrorSummary.mockReset();
  loadRecentErrorSummary.mockResolvedValue(SUMMARY);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function submitFeedback(text: string) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  fireEvent.change(screen.getByLabelText('Feedback'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  const init = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)[0]?.[1];
  return JSON.parse(String(init?.body)) as { message: string };
}

it('attaches the recent error summary by default on desktop without the user reviewing it', async () => {
  renderWithLocalization(<FeedbackDialog endpoint="https://feedback.example.test" onClose={() => undefined} open />);

  expect(screen.getByLabelText(LABEL)).toBeChecked();
  const body = await submitFeedback('EPUB import does not work.');

  expect(body.message.startsWith('EPUB import does not work.\n\n---\n')).toBe(true);
  expect(body.message).toContain('EPERM: operation not permitted');
});

it('sends only the user text after the user unticks the option', async () => {
  renderWithLocalization(<FeedbackDialog endpoint="https://feedback.example.test" onClose={() => undefined} open />);

  fireEvent.click(screen.getByLabelText(LABEL));
  const body = await submitFeedback('No details please.');

  expect(body.message).toBe('No details please.');
  expect(loadRecentErrorSummary).not.toHaveBeenCalled();
});

it('still submits the user text when no summary can be loaded', async () => {
  loadRecentErrorSummary.mockResolvedValue(null);
  renderWithLocalization(<FeedbackDialog endpoint="https://feedback.example.test" onClose={() => undefined} open />);

  const body = await submitFeedback('Something broke.');

  expect(body.message).toBe('Something broke.');
});

it('does not offer the option outside the desktop app', () => {
  isDesktopRuntime.mockReturnValue(false);
  renderWithLocalization(<FeedbackDialog endpoint="https://feedback.example.test" onClose={() => undefined} open />);

  expect(screen.queryByLabelText(LABEL)).not.toBeInTheDocument();
});
