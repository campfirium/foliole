import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { HTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

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

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeAll(async () => {
  await preloadTranslationCatalog('en');
});

describe('FeedbackDialog text submission', () => {
  it('keeps submit disabled until feedback text is present', () => {
    renderWithLocalization(<FeedbackDialog endpoint="https://feedback.example.test" onClose={() => undefined} open />);

    const submit = screen.getByRole('button', { name: 'Send' });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Feedback'), { target: { value: 'This path should stay low friction.' } });
    expect(submit).not.toBeDisabled();
  });

  it('preserves text and reports unavailable endpoint', async () => {
    renderWithLocalization(<FeedbackDialog onClose={() => undefined} open />);

    fireEvent.change(screen.getByLabelText('Feedback'), { target: { value: 'Please receive this later.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Feedback is not available in this build.')).toBeInTheDocument();
    expect(screen.getByLabelText('Feedback')).toHaveValue('Please receive this later.');
  });

  it('submits JSON feedback when configured', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    renderWithLocalization(<FeedbackDialog endpoint="https://feedback.example.test" onClose={() => undefined} open />);

    fireEvent.change(screen.getByLabelText('Feedback'), { target: { value: 'The app needs an easier feedback path.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const requestInit = calls[0]?.[1];
    if (!requestInit) {
      throw new Error('missing feedback request init');
    }
    expect(JSON.parse(requestInit.body as string)).toMatchObject({
      message: 'The app needs an easier feedback path.',
      metadata: { platform: 'desktop' }
    });
    expect(await screen.findByText('Thanks. Your message has reached us.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Feedback')).not.toBeInTheDocument();
  });

  it('shows a partial success message when attachments are skipped by the worker', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        attachmentsAccepted: false,
        ok: true,
        warning: 'attachments_budget_exceeded'
      }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithLocalization(<FeedbackDialog endpoint="https://feedback.example.test" onClose={() => undefined} open />);

    fireEvent.change(screen.getByLabelText('Feedback'), { target: { value: 'The screenshot can wait.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Thanks. Your message has reached us.')).toBeInTheDocument();
    expect(screen.getByText('Your message was sent. Images are temporarily unavailable and were not attached.')).toBeInTheDocument();
  });
});

describe('FeedbackDialog attachments', () => {
  it('adds pasted images to the feedback payload', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    renderWithLocalization(<FeedbackDialog endpoint="https://feedback.example.test" onClose={() => undefined} open />);

    const pastedImage = new File(['image-bytes'], 'screenshot.png', { type: 'image/png' });
    Object.defineProperty(pastedImage, 'arrayBuffer', {
      value: vi.fn(async () => new TextEncoder().encode('image-bytes').buffer)
    });
    fireEvent.change(screen.getByLabelText('Feedback'), { target: { value: 'Screenshot pasted inline.' } });
    fireEvent.paste(screen.getByRole('dialog'), {
      clipboardData: {
        files: [pastedImage],
        items: []
      }
    });

    expect(await screen.findByText('1/3 images')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const requestInit = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)[0]?.[1];
    expect(JSON.parse(requestInit?.body as string)).toMatchObject({
      attachments: [{ name: 'screenshot.png', type: 'image/png' }],
      message: 'Screenshot pasted inline.'
    });
  });

  it('shows pasted image previews and allows removing them before sending', async () => {
    renderWithLocalization(<FeedbackDialog endpoint="https://feedback.example.test" onClose={() => undefined} open />);

    const pastedImage = new File(['image-bytes'], 'preview.png', { type: 'image/png' });
    Object.defineProperty(pastedImage, 'arrayBuffer', {
      value: vi.fn(async () => new TextEncoder().encode('image-bytes').buffer)
    });
    fireEvent.paste(screen.getByRole('dialog'), {
      clipboardData: {
        files: [pastedImage],
        items: []
      }
    });

    expect(await screen.findByRole('img', { name: 'preview.png' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove preview.png' }));
    expect(screen.queryByRole('img', { name: 'preview.png' })).not.toBeInTheDocument();
    expect(screen.getByText('0/3 images')).toBeInTheDocument();
  });

});
