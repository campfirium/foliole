import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { HTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { getRuntimeAppSettingsKeys } from '../../shared/config/appSettingsClassification';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { preloadTranslationCatalog } from '../../shared/localization/translations';

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

const STORAGE_KEY = APP_SETTINGS_STORAGE_KEYS.feedbackRememberedContact;

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

beforeAll(async () => {
  await preloadTranslationCatalog('en');
});

async function submitFeedback(contact: string, responseStatus = 200) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: responseStatus === 200 }), { status: responseStatus }));
  vi.stubGlobal('fetch', fetchMock);
  renderWithLocalization(<FeedbackDialog endpoint="https://feedback.example.test" onClose={() => undefined} open />);
  fireEvent.change(screen.getByLabelText('Feedback'), { target: { value: 'Remember the reply address.' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: contact } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
}

describe('FeedbackDialog remembered contact', () => {
  it('keeps the remembered email out of runtime settings', () => {
    expect(getRuntimeAppSettingsKeys()).not.toContain(STORAGE_KEY);
  });

  it('remembers a submitted email and prefills it the next time', async () => {
    await submitFeedback(' person@example.com ');
    await screen.findByText('Feedback sent');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('person@example.com');

    renderWithLocalization(<FeedbackDialog endpoint="https://feedback.example.test" onClose={() => undefined} open />);
    expect(screen.getByLabelText('Email')).toHaveValue('person@example.com');
  });

  it('clears the remembered email after a successful submission without one', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'old@example.com');
    await submitFeedback('');
    await screen.findByText('Feedback sent');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('keeps the remembered email when submission fails', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'saved@example.com');
    await submitFeedback('replacement@example.com', 500);
    await screen.findByText('Feedback could not be sent. Your text is still here.');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('saved@example.com');
  });
});
