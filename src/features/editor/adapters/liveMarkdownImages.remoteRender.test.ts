import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { REMOTE_IMAGE_PROTOCOL_SCHEME } from '../../../../lib/platform/remoteImageProtocolUrl';
import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { resetRemoteImageFailureHintDismissalForTests } from '../model/remoteImageFailureHintSetting';

const demoRuntimeMock = vi.hoisted(() => ({
  isDemo: false
}));

vi.mock('../../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn(() => null)
}));

vi.mock('../../../shared/platform/runtime/demoRuntime', () => ({
  getDemoRuntimeState: () => ({ isDemo: demoRuntimeMock.isDemo })
}));

vi.mock('../../../shared/platform/bridge', () => ({
  openExternalUrl: vi.fn()
}));

vi.mock('../../../shared/platform/remoteImageSourceRecovery', () => ({
  forgetRemoteImageLearnedSource: vi.fn(),
  loadRemoteImageSourceContext: vi.fn(async () => ({
    imageHost: 'example.com',
    learnedSourceOrigin: null,
    source: 'none',
    sourceOrigin: null
  })),
  saveRemoteImageSourceWebsite: vi.fn()
}));

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';
import { createMarkdownImageWidgetDom } from './liveMarkdownImages';

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

function getRemoteImageSourceParam(host: HTMLElement) {
  const src = getRemoteImage(host)?.src ?? '';
  return new URL(src).searchParams.get('source');
}

async function waitForRemoteImageSrc(host: HTMLElement) {
  await waitFor(() => {
    expect(getRemoteImage(host)?.src).toContain(`${REMOTE_IMAGE_PROTOCOL_SCHEME}://render`);
  });
  return getRemoteImage(host)?.src ?? '';
}

async function runDemoRemoteImageLimitCase() {
  demoRuntimeMock.isDemo = true;
  const { adapter, host } = createAdapterHost('![Remote](https://example.com/missing.png)');

  getRemoteImage(host)?.dispatchEvent(new Event('error'));

  await waitFor(() => {
    const status = host.querySelector('.cm-md-image-status[data-md-image-status="unavailable"]');
    expect(status?.textContent).toContain('Image features are not included in Demo');
    expect(status?.textContent).toContain('example.com');
  });

  adapter.destroy();
}

describe('live markdown remote image rendering', () => {
  beforeEach(() => {
    demoRuntimeMock.isDemo = false;
    resetRemoteImageFailureHintDismissalForTests();
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility, 'hidden');
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.autoLocalizeRemoteImages, 'true');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
  });

  it('renders remote images through the internal protocol with a silent placeholder', async () => {
    const { adapter, host } = createAdapterHost('![Remote](https://example.com/cover.png)');

    const status = host.querySelector('.cm-md-image-status[data-md-image-status="loading"]');
    expect(status?.textContent).toBe('');
    const src = await waitForRemoteImageSrc(host);
    expect(src).toContain('persist=1');
    expect(src).toContain('nodeId=node-1');

    getRemoteImage(host)?.dispatchEvent(new Event('load'));

    await waitFor(() => {
      expect(host.querySelector('.cm-md-image-status')).toBeNull();
      expect(host.querySelector('.cm-md-image-surface-loading')).toBeNull();
      expect(getRemoteImage(host)?.src).toContain(`${REMOTE_IMAGE_PROTOCOL_SCHEME}://render`);
    });

    adapter.destroy();
  });

  it('keeps remote image rendering preview-only when auto localization is disabled', async () => {
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.autoLocalizeRemoteImages, 'false');
    const { adapter, host } = createAdapterHost('![Remote](https://example.com/cover.png)');

    const src = await waitForRemoteImageSrc(host);

    expect(src).not.toContain('persist=1');
    expect(src).toContain('nodeId=node-1');

    adapter.destroy();
  });

  it('shows unavailable when the internal protocol image fails', async () => {
    const { adapter, host } = createAdapterHost('![Remote](https://example.com/missing.png)');

    getRemoteImage(host)?.dispatchEvent(new Event('error'));

    await waitFor(() => {
      const status = host.querySelector('.cm-md-image-status[data-md-image-status="unavailable"]');
      expect(status?.textContent).toContain('Image unavailable');
      expect(host.querySelector('.cm-md-image-status-frame')).not.toBeNull();
      expect(host.querySelector('.cm-md-image-status-frame-glyph')).not.toBeNull();
      expect(status?.textContent).toContain('example.com');
      expect(status?.textContent).toContain('/missing.png');
      expect(host.querySelector('button[aria-label="Retry"]')).not.toBeNull();
      expect(host.querySelector('button[aria-label="Add source"]')).not.toBeNull();
      expect(host.querySelector('button[aria-label="Remove"]')).not.toBeNull();
      expect(status?.textContent).not.toContain('Copy image URL');
    });

    adapter.destroy();
  });

  it('explains remote image limits in the Demo runtime', async () => {
    await runDemoRemoteImageLimitCase();
  });

});

describe('live markdown remote image retry action', () => {
  beforeEach(() => {
    resetRemoteImageFailureHintDismissalForTests();
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility, 'hidden');
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.autoLocalizeRemoteImages, 'true');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
  });

  it('adds a retry nonce when retrying a failed remote image from source', async () => {
    const { adapter, host } = createAdapterHost('![Remote](https://example.com/missing.png)');

    getRemoteImage(host)?.dispatchEvent(new Event('error'));
    await waitFor(() => {
      expect(host.querySelector('button[aria-label="Retry"]')).not.toBeNull();
    });
    (host.querySelector('button[aria-label="Retry"]') as HTMLButtonElement | null)?.click();

    const src = await waitForRemoteImageSrc(host);
    expect(new URL(src).searchParams.get('retry')).toBeTruthy();

    adapter.destroy();
  });
});

describe('live markdown remote image syntax coverage', () => {
  beforeEach(() => {
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility, 'hidden');
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.autoLocalizeRemoteImages, 'true');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
  });

  it('keeps remote image urls with parentheses intact', async () => {
    const { adapter, host } = createAdapterHost('![Remote](https://example.com/gallery/(cover).png)');

    await waitForRemoteImageSrc(host);
    expect(getRemoteImageSourceParam(host)).toBe('https://example.com/gallery/(cover).png');

    adapter.destroy();
  });

  it('hides wrapping link syntax when the link label is a remote image', async () => {
    const source = 'https://example.com/cover.png';
    const { adapter, host } = createAdapterHost(`[![](${source})](${source})`);

    await waitForRemoteImageSrc(host);

    expect(host.querySelector('.cm-md-image-status[data-md-image-status="loading"]')).not.toBeNull();
    expect(host.querySelector('.cm-content')?.textContent ?? '').not.toContain(source);

    adapter.destroy();
  });

  it('keeps image rendering stable when the cursor is on the image line', async () => {
    const source = 'https://example.com/focus.png';
    const { adapter, host } = createAdapterHost(`![Focus](${source})`);

    adapter.focus();
    adapter.setSelection({ from: 1, to: 1 });

    await waitFor(() => {
      expect(getRemoteImage(host)?.src).toContain(encodeURIComponent(source));
    });
    expect(host.querySelector('.cm-content')?.textContent ?? '').not.toContain(`![Focus](${source})`);

    adapter.destroy();
  });
});

describe('live markdown remote image loading order', () => {
  beforeEach(() => {
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.autoLocalizeRemoteImages, 'true');
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('sets the remote src only after the hidden loading surface is prepared', async () => {
    const widget = createMarkdownImageWidgetDom({
      alt: 'Remote',
      attachmentId: null,
      display: 'block',
      from: 0,
      source: 'https://example.com/cached.png',
      to: 42
    }, 'node-1');
    const image = widget.querySelector('.cm-md-image-element') as HTMLImageElement | null;
    const surface = widget.querySelector('.cm-md-image-surface') as HTMLElement | null;

    expect(image?.getAttribute('src')).toBeNull();
    expect(surface?.classList.contains('cm-md-image-surface-loading')).toBe(true);
    await Promise.resolve();

    expect(image?.src).toContain(`${REMOTE_IMAGE_PROTOCOL_SCHEME}://render`);
    image?.dispatchEvent(new Event('load'));

    await waitFor(() => {
      expect(surface?.classList.contains('cm-md-image-surface-loading')).toBe(false);
      expect(surface?.style.width).toBe('');
    });
  });

  it('requests an editor measurement after remote image load changes widget height', async () => {
    const requestMeasure = vi.fn();
    const widget = createMarkdownImageWidgetDom({
      alt: 'Remote',
      attachmentId: null,
      display: 'block',
      from: 0,
      source: 'https://example.com/cached.png',
      to: 42
    }, 'node-1', null, requestMeasure);

    await Promise.resolve();
    widget.querySelector('.cm-md-image-element')?.dispatchEvent(new Event('load'));

    await waitFor(() => {
      expect(widget.querySelector('.cm-md-image-status')).toBeNull();
    });
    expect(requestMeasure).toHaveBeenCalled();
  });
});
