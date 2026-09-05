import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { HTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { ZH_HANS_FEEDBACK_TRANSLATIONS } from '../../shared/localization/locales/zhHansFeedback';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { preloadTranslationCatalog } from '../../shared/localization/translations';
import { onWindowEscape } from '../../shared/platform/keyboard';

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
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

beforeAll(async () => {
  await preloadTranslationCatalog('en');
});

function createPastedImage(name: string, bytes = 'image-bytes') {
  const file = new File([bytes], name, { type: 'image/png' });
  Object.defineProperty(file, 'arrayBuffer', {
    value: vi.fn(async () => new TextEncoder().encode(bytes).buffer)
  });
  return file;
}

describe('FeedbackDialog shell behavior', () => {
  it('closes from the shared Escape stack before background handlers', () => {
    const backgroundClose = vi.fn();
    const onClose = vi.fn();
    const unlistenBackground = onWindowEscape(backgroundClose);
    renderWithLocalization(<FeedbackDialog endpoint="https://feedback.example.test" onClose={onClose} open />);

    window.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, key: 'Escape' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(backgroundClose).not.toHaveBeenCalled();
    unlistenBackground();
  });
});

describe('FeedbackDialog text submission', () => {
  it('keeps submit disabled until feedback text is present', () => {
    renderWithLocalization(<FeedbackDialog endpoint="https://feedback.example.test" onClose={() => undefined} open />);

    const submit = screen.getByRole('button', { name: 'Send' });
    expect(submit).toBeDisabled();
    expect(submit.className).toContain('bg-transparent');
    expect(submit.className).toContain('border-shellless-control-border');
    expect(submit.className).not.toContain('workspace-region-main-rail-bg');
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Feedback'), { target: { value: 'This path should stay low friction.' } });
    expect(submit).not.toBeDisabled();
  });
});

describe('FeedbackDialog surface layout', () => {
  it('keeps the shell-less feedback surface compact', () => {
    renderWithLocalization(<FeedbackDialog endpoint="https://feedback.example.test" onClose={() => undefined} open />);

    expect(screen.getByLabelText('Feedback').className).toContain('min-h-40');
    expect(screen.getByLabelText('Feedback').className).toContain('pt-[var(--app-shellless-input-padding-block-start)]');
    expect(screen.getByRole('button', { name: 'Send' }).closest('div')?.className).toContain('py-2');
  });

  it('keeps the lower metadata above the single action divider', () => {
    renderWithLocalization(<FeedbackDialog endpoint="https://feedback.example.test" onClose={() => undefined} open />);

    const metadataGrid = screen.getByLabelText('Email').closest('label')?.parentElement;
    expect(metadataGrid?.className).not.toContain('border-shellless-divider');
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' }).closest('div')?.className).toContain('border-shellless-divider');
  });
});

describe('FeedbackDialog text submission', () => {
  it('preserves text and reports unavailable endpoint', async () => {
    renderWithLocalization(<FeedbackDialog onClose={() => undefined} open />);

    fireEvent.change(screen.getByLabelText('Feedback'), { target: { value: 'Please receive this later.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Feedback is not available in this build.')).toBeInTheDocument();
    expect(screen.getByLabelText('Feedback')).toHaveValue('Please receive this later.');
  });

  it('submits JSON feedback when configured', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('zh-CN');
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Electron');
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
      metadata: { appVersion: expect.any(String), language: 'en', platform: 'windows' }
    });
    expect(await screen.findByText('Feedback sent')).toBeInTheDocument();
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

    expect(await screen.findByText('Feedback sent')).toBeInTheDocument();
    expect(screen.getByText('Your message was sent. Images are temporarily unavailable and were not attached.')).toBeInTheDocument();
  });
});

describe('FeedbackDialog action styling', () => {
  it('keeps send on the shell-less control style and attachments as metadata', () => {
    renderWithLocalization(<FeedbackDialog endpoint="https://feedback.example.test" onClose={() => undefined} open />);

    const submit = screen.getByRole('button', { name: 'Send' });
    const picker = screen.getByText('Add or paste images').closest('label');
    expect(submit.className).toContain('rounded-shellless-control');
    expect(submit.className).toContain('border-shellless-control-border');
    expect(submit.className).toContain('text-shellless-control-fg');
    expect(picker?.className).toContain('text-shellless-control-fg');
    expect(picker?.className).not.toContain('border-shellless-control-border');
    expect(picker?.className).not.toContain('rounded-shellless-control');
    expect(screen.queryByText('Images')).not.toBeInTheDocument();
    expect(screen.queryByText('0/3')).not.toBeInTheDocument();
    expect(screen.queryByText('Paste screenshots')).not.toBeInTheDocument();
  });

  it('shows an update hint only when the current version is behind the checked latest version', () => {
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.updateCheckState, JSON.stringify({
      lastCheckStatus: 'available',
      latestVersion: '9.0.0'
    }));
    const { unmount } = renderWithLocalization(<FeedbackDialog endpoint="https://feedback.example.test" onClose={() => undefined} open />);

    expect(screen.getByText('This version is not the latest. We recommend updating before sending feedback.')).toBeInTheDocument();
    unmount();

    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.updateCheckState, JSON.stringify({
      lastCheckStatus: 'current',
      latestVersion: null
    }));
    renderWithLocalization(<FeedbackDialog endpoint="https://feedback.example.test" onClose={() => undefined} open />);

    expect(screen.queryByText('This version is not the latest. We recommend updating before sending feedback.')).not.toBeInTheDocument();
  });

  it('uses the lighter Chinese feedback field copy', () => {
    expect(ZH_HANS_FEEDBACK_TRANSLATIONS['feedback.contact.placeholder']).toBe('如需回复，请留下邮箱');
    expect(ZH_HANS_FEEDBACK_TRANSLATIONS['feedback.attachments.add']).toBe('添加或粘贴图片');
  });
});

describe('FeedbackDialog attachments', () => {
  it('adds pasted images to the feedback payload', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    renderWithLocalization(<FeedbackDialog endpoint="https://feedback.example.test" onClose={() => undefined} open />);

    const pastedImage = createPastedImage('screenshot.png');
    fireEvent.change(screen.getByLabelText('Feedback'), { target: { value: 'Screenshot pasted inline.' } });
    fireEvent.paste(screen.getByRole('dialog'), {
      clipboardData: {
        files: [pastedImage],
        items: []
      }
    });

    await waitFor(() => expect(screen.getByText('Add or paste images')).toBeInTheDocument());
    expect(screen.queryByText('1/3')).not.toBeInTheDocument();
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

    const pastedImage = createPastedImage('preview.png');
    fireEvent.paste(screen.getByRole('dialog'), {
      clipboardData: {
        files: [pastedImage],
        items: []
      }
    });

    const image = await screen.findByRole('img', { name: 'preview.png' });
    expect(image).toBeInTheDocument();
    expect(image.closest('div')?.className).toContain('border-shellless-control-border');
    expect(image.closest('div')?.className).toContain('bg-shellless-surface');
    fireEvent.click(screen.getByRole('button', { name: 'Remove preview.png' }));
    expect(screen.queryByRole('img', { name: 'preview.png' })).not.toBeInTheDocument();
    expect(screen.getByText('Add or paste images')).toBeInTheDocument();
    expect(screen.queryByText('0/3')).not.toBeInTheDocument();
  });
});

describe('FeedbackDialog attachment limits', () => {
  it('keeps the available image slots when too many images are pasted', async () => {
    renderWithLocalization(<FeedbackDialog endpoint="https://feedback.example.test" onClose={() => undefined} open />);

    const pastedImages = Array.from({ length: 4 }, (_, index) => createPastedImage(`screen-${index + 1}.png`, `image-${index}`));
    fireEvent.paste(screen.getByRole('dialog'), {
      clipboardData: {
        files: pastedImages,
        items: []
      }
    });

    expect(await screen.findByText('You can add up to 3 images. The first 3 were kept.')).toBeInTheDocument();
    expect(screen.queryByText('3/3')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'screen-1.png' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'screen-3.png' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'screen-4.png' })).not.toBeInTheDocument();
  });

});
