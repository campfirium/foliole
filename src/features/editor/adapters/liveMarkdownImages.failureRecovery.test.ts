import { createEvent, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { resetRemoteImageFailureHintDismissalForTests } from '../model/remoteImageFailureHintSetting';

const bridgeMock = vi.hoisted(() => ({
  forgetRemoteImageLearnedSource: vi.fn(async () => true),
  loadRemoteImageSourceContext: vi.fn(async () => ({
    imageHost: 'example.com',
    learnedSourceOrigin: null,
    source: 'none',
    sourceOrigin: null
  })),
  saveRemoteImageSourceWebsite: vi.fn(async () => true)
}));

vi.mock('../../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn(() => null)
}));

vi.mock('../../../shared/platform/remoteImageSourceRecovery', () => bridgeMock);

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

function createAdapterHost(initialContent: string) {
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = new CodeMirrorEditorAdapter(host, { initialContent });
  adapter.setNodeId('node-1');
  return { adapter, host };
}

function getRemoteImage(host: HTMLElement) {
  return host.querySelector('.cm-md-image-element') as HTMLImageElement | null;
}

async function waitForFailedStatus(
  host: HTMLElement,
  selector = '.cm-md-image-status[data-md-image-status="unavailable"]'
) {
  await waitFor(() => {
    expect(host.querySelector(selector)).not.toBeNull();
  });
  return host.querySelector(selector) as HTMLElement;
}

function clickStatusButton(host: HTMLElement, label: string) {
  const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  button?.click();
}

beforeEach(() => {
  vi.restoreAllMocks();
  bridgeMock.forgetRemoteImageLearnedSource.mockReset().mockResolvedValue(true);
  bridgeMock.loadRemoteImageSourceContext.mockReset().mockResolvedValue({
    imageHost: 'example.com',
    learnedSourceOrigin: null,
    source: 'none',
    sourceOrigin: null
  });
  bridgeMock.saveRemoteImageSourceWebsite.mockReset().mockResolvedValue(true);
  resetRemoteImageFailureHintDismissalForTests();
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility, 'hidden');
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.autoLocalizeRemoteImages, 'true');
});

afterEach(() => {
  document.body.innerHTML = '';
  window.localStorage.clear();
});

describe('live markdown remote image failure recovery menu', () => {
  it('opens a block failed image context menu and saves a source website for the current image', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('https://source.example/article?id=1');
    const { adapter, host } = createAdapterHost('![Remote](https://example.com/missing.png)');
    const parentContextMenu = vi.fn();
    host.addEventListener('contextmenu', parentContextMenu);

    getRemoteImage(host)?.dispatchEvent(new Event('error'));
    const status = await waitForFailedStatus(host);
    const contextMenu = createEvent.contextMenu(status, { bubbles: true, clientX: 28, clientY: 36 });
    fireEvent(status, contextMenu);

    await waitFor(() => {
      expect(document.body.querySelector('[role="menu"]')?.textContent).toContain('Add source');
      expect(document.body.querySelector('[role="menu"]')?.textContent).toContain('Remove');
    });
    expect(contextMenu.defaultPrevented).toBe(true);
    expect(parentContextMenu).not.toHaveBeenCalled();
    (document.body.querySelectorAll('[role="menuitem"]')[1] as HTMLButtonElement | undefined)?.click();

    await waitFor(() => {
      expect(bridgeMock.saveRemoteImageSourceWebsite).toHaveBeenCalledWith(
        'https://example.com/missing.png',
        'https://source.example/article?id=1'
      );
    });
    expect(document.body.querySelector('[role="menu"]')).toBeNull();

    adapter.destroy();
  });

  it('shows forget only when the failed image used a learned source', async () => {
    bridgeMock.loadRemoteImageSourceContext.mockResolvedValueOnce({
      imageHost: 'example.com',
      learnedSourceOrigin: 'https://source.example/',
      source: 'learned',
      sourceOrigin: 'https://source.example/'
    });
    const { adapter, host } = createAdapterHost('![Remote](https://example.com/missing.png)');

    getRemoteImage(host)?.dispatchEvent(new Event('error'));
    await waitFor(() => {
      expect(bridgeMock.loadRemoteImageSourceContext).toHaveBeenCalled();
    });
    fireEvent.contextMenu(await waitForFailedStatus(host), { clientX: 28, clientY: 36 });

    await waitFor(() => {
      expect(document.body.querySelector('[role="menu"]')?.textContent).toContain('Forget learned source for this site');
    });
    (document.body.querySelectorAll('[role="menuitem"]')[3] as HTMLButtonElement | undefined)?.click();

    await waitFor(() => {
      expect(bridgeMock.forgetRemoteImageLearnedSource).toHaveBeenCalledWith('https://example.com/missing.png');
    });

    adapter.destroy();
  });
});

describe('live markdown remote image failure retry actions', () => {
  it('closes the failed image context menu before retry rebuilds the widget', async () => {
    const { adapter, host } = createAdapterHost('![Remote](https://example.com/missing.png)');

    getRemoteImage(host)?.dispatchEvent(new Event('error'));
    fireEvent.contextMenu(await waitForFailedStatus(host), { clientX: 28, clientY: 36 });
    await waitFor(() => {
      expect(document.body.querySelector('[role="menu"]')).not.toBeNull();
    });
    (document.body.querySelector('[role="menuitem"]') as HTMLButtonElement | null)?.click();

    await waitFor(() => {
      expect(new URL(getRemoteImage(host)?.src ?? '').searchParams.get('retry')).toBeTruthy();
    });
    expect(document.body.querySelector('[role="menu"]')).toBeNull();

    adapter.destroy();
  });

  it('keeps the failed placeholder stable when an invalid source website is dismissed', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('');
    const { adapter, host } = createAdapterHost('![Remote](https://example.com/missing.png)');

    getRemoteImage(host)?.dispatchEvent(new Event('error'));
    fireEvent.contextMenu(await waitForFailedStatus(host), { clientX: 28, clientY: 36 });
    await waitFor(() => {
      expect(document.body.querySelector('[role="menu"]')).not.toBeNull();
    });
    (document.body.querySelectorAll('[role="menuitem"]')[1] as HTMLButtonElement | undefined)?.click();

    await waitFor(() => {
      expect(host.querySelector('.cm-md-image-status[data-md-image-status="unavailable"]')?.textContent).toContain('Image unavailable');
    });
    expect(bridgeMock.saveRemoteImageSourceWebsite).not.toHaveBeenCalled();

    adapter.destroy();
  });
});

describe('live markdown remote image failure recovery hint', () => {
  it('uses the inline action bar instead of a separate recovery hint', async () => {
    const { adapter, host } = createAdapterHost('![Remote](https://example.com/one.png)');

    getRemoteImage(host)?.dispatchEvent(new Event('error'));
    await waitForFailedStatus(host);
    expect(host.querySelector('.cm-md-image-status-tip')).toBeNull();
    expect(host.querySelector('button[aria-label="Retry"]')).not.toBeNull();
    expect(host.querySelector('button[aria-label="Add source"]')).not.toBeNull();
    expect(host.querySelector('button[aria-label="Remove"]')).not.toBeNull();

    adapter.destroy();
  });

  it('saves a source website from the visible recovery action', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('https://source.example/article');
    const { adapter, host } = createAdapterHost('![Remote](https://example.com/one.png)');

    getRemoteImage(host)?.dispatchEvent(new Event('error'));
    await waitForFailedStatus(host);
    clickStatusButton(host, 'Add source');

    await waitFor(() => {
      expect(bridgeMock.saveRemoteImageSourceWebsite).toHaveBeenCalledWith(
        'https://example.com/one.png',
        'https://source.example/article'
      );
    });

    adapter.destroy();
  });

  it('removes a failed image from the document when the visible remove action is used', async () => {
    const { adapter, host } = createAdapterHost('Lead\n\n![Remote](https://example.com/one.png)\n\nTail');

    getRemoteImage(host)?.dispatchEvent(new Event('error'));
    await waitForFailedStatus(host);
    clickStatusButton(host, 'Remove');

    await waitFor(() => {
      expect(adapter.getContent()).toBe('Lead\n\nTail');
    });

    adapter.destroy();
  });

  it('does not attach the custom failure menu to inline failed images', async () => {
    const { adapter, host } = createAdapterHost('Text ![Remote](https://example.com/inline.png) tail');

    getRemoteImage(host)?.dispatchEvent(new Event('error'));
    const status = await waitForFailedStatus(host, '.cm-md-image-status-inline[data-md-image-status="unavailable"]');
    fireEvent.contextMenu(status, { clientX: 28, clientY: 36 });

    expect(document.body.querySelector('[role="menu"]')).toBeNull();

    adapter.destroy();
  });
});
