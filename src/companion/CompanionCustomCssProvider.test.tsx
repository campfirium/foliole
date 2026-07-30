import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const syncObjects = vi.hoisted(() => ({
  load: vi.fn<(key: string) => Promise<string | null>>(async () => null),
  save: vi.fn(async () => ({ content_hash: 'hash', object_id: 'setting' }))
}));

vi.mock('../shared/platform/companionSyncObjects', () => ({
  loadCompanionSyncSettingValueJson: syncObjects.load,
  saveCompanionSyncSettingRecord: syncObjects.save
}));

import type { CompanionCustomCssCollection } from './companionCustomCssModel';
import { CompanionCustomCssProvider, useCompanionCustomCss } from './CompanionCustomCssProvider';
import { COMPANION_CUSTOM_CSS_STORAGE_KEY } from './companionCustomCssStorage';

function collection(name: string, sourceCss = 'p { color: red; }', enabled = true): CompanionCustomCssCollection {
  return {
    snippets: [{ enabled, id: '00000000-0000-4000-8000-000000000001', name, sourceCss }],
    version: 1
  };
}

function Probe() {
  const customCss = useCompanionCustomCss();
  return (
    <>
      <output data-testid="name">{customCss.collection.snippets[0]?.name ?? 'empty'}</output>
      <output data-testid="issue">{customCss.issue ?? 'none'}</output>
      <button onClick={customCss.markDraftEdited} type="button">Edit draft</button>
      <button onClick={() => void customCss.saveCollection(collection('Saved', 'h1 { color: blue; }'))} type="button">
        Save styles
      </button>
    </>
  );
}

function renderProvider(runtimeKind: 'android-capacitor' | 'ios-capacitor' | 'web-preview', refreshKey: string | null = null) {
  return render(
    <CompanionCustomCssProvider refreshKey={refreshKey} runtimeKind={runtimeKind}>
      <Probe />
    </CompanionCustomCssProvider>
  );
}

function customStyleNode() {
  return document.head.querySelector<HTMLStyleElement>('style[data-companion-custom-css="true"]');
}

beforeEach(() => {
  window.localStorage.clear();
  document.head.querySelectorAll('style[data-test-style-mod], style[data-companion-custom-css]').forEach((node) => node.remove());
  syncObjects.load.mockReset();
  syncObjects.load.mockResolvedValue(null);
  syncObjects.save.mockReset();
  syncObjects.save.mockResolvedValue({ content_hash: 'hash', object_id: 'setting' });
});

describe('CompanionCustomCssProvider success paths', () => {
  it('uses verified local state immediately and maintains one compiled style after style-mod', async () => {
    const sourceCss = 'p { color: red; }';
    window.localStorage.setItem(COMPANION_CUSTOM_CSS_STORAGE_KEY, JSON.stringify(collection('Local', sourceCss)));
    const styleMod = document.createElement('style');
    styleMod.dataset.testStyleMod = 'true';
    document.head.prepend(styleMod);

    renderProvider('web-preview');

    expect(screen.getByTestId('name')).toHaveTextContent('Local');
    await waitFor(() => expect(customStyleNode()?.textContent).toContain('[data-companion-readable-document="true"] p'));
    expect(customStyleNode()?.textContent).not.toBe(sourceCss);
    expect([...document.head.children].indexOf(styleMod)).toBeLessThan(
      [...document.head.children].indexOf(customStyleNode()!)
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save styles' }));
    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Saved'));
    expect(document.head.querySelectorAll('style[data-companion-custom-css="true"]')).toHaveLength(1);
    expect(customStyleNode()?.textContent).toContain('h1');
    expect(syncObjects.load).not.toHaveBeenCalled();
    expect(syncObjects.save).not.toHaveBeenCalled();
  });

  it('hydrates Android native state and saves it before replacing cache and runtime CSS', async () => {
    syncObjects.load.mockResolvedValue(JSON.stringify(collection('Native', 'blockquote { opacity: .8; }')));
    renderProvider('android-capacitor');

    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Native'));
    expect(customStyleNode()?.textContent).toContain('blockquote');

    fireEvent.click(screen.getByRole('button', { name: 'Save styles' }));
    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Saved'));
    expect(syncObjects.save).toHaveBeenCalledWith({
      key: 'custom_css_snippets',
      valueJson: JSON.stringify(collection('Saved', 'h1 { color: blue; }'))
    });
    expect(JSON.parse(window.localStorage.getItem(COMPANION_CUSTOM_CSS_STORAGE_KEY)!)).toEqual(
      collection('Saved', 'h1 { color: blue; }')
    );
  });
});

describe('CompanionCustomCssProvider safety paths', () => {
  it('uses a local revision guard when a native hydrate resolves after draft editing', async () => {
    window.localStorage.setItem(COMPANION_CUSTOM_CSS_STORAGE_KEY, JSON.stringify(collection('Local')));
    let resolveHydrate!: (value: string | null) => void;
    syncObjects.load.mockReturnValue(new Promise((resolve) => { resolveHydrate = resolve; }));
    renderProvider('android-capacitor');

    fireEvent.click(screen.getByRole('button', { name: 'Edit draft' }));
    await act(async () => resolveHydrate(JSON.stringify(collection('Stale'))));

    expect(screen.getByTestId('name')).toHaveTextContent('Local');
    expect(customStyleNode()?.textContent).toContain('color: red');
  });

  it('removes injected CSS for a corrupted native payload and exposes recovery', async () => {
    window.localStorage.setItem(COMPANION_CUSTOM_CSS_STORAGE_KEY, JSON.stringify(collection('Local')));
    syncObjects.load.mockResolvedValue(JSON.stringify({ snippets: [], version: 2 }));
    renderProvider('android-capacitor');

    await waitFor(() => expect(screen.getByTestId('issue')).toHaveTextContent('invalid'));
    expect(screen.getByTestId('name')).toHaveTextContent('empty');
    expect(customStyleNode()?.textContent).toBe('');
  });

  it('keeps the last valid state on native load or save failure', async () => {
    window.localStorage.setItem(COMPANION_CUSTOM_CSS_STORAGE_KEY, JSON.stringify(collection('Local')));
    syncObjects.load.mockRejectedValue(new Error('offline'));
    syncObjects.save.mockRejectedValue(new Error('write failed'));
    renderProvider('android-capacitor');

    await waitFor(() => expect(screen.getByTestId('issue')).toHaveTextContent('sync'));
    expect(screen.getByTestId('name')).toHaveTextContent('Local');
    fireEvent.click(screen.getByRole('button', { name: 'Save styles' }));
    await waitFor(() => expect(screen.getByTestId('issue')).toHaveTextContent('save'));
    expect(screen.getByTestId('name')).toHaveTextContent('Local');
    expect(customStyleNode()?.textContent).toContain('color: red');
  });

  it('keeps iOS at zero cache, native setting, and style activity', () => {
    window.localStorage.setItem(COMPANION_CUSTOM_CSS_STORAGE_KEY, JSON.stringify(collection('Local')));
    renderProvider('ios-capacitor');

    expect(screen.getByTestId('name')).toHaveTextContent('empty');
    expect(customStyleNode()).toBeNull();
    expect(syncObjects.load).not.toHaveBeenCalled();
    expect(syncObjects.save).not.toHaveBeenCalled();
  });
});

describe('CompanionCustomCssProvider platform gates', () => {
  it('retains verified local styles when Android has no native setting yet', async () => {
    window.localStorage.setItem(COMPANION_CUSTOM_CSS_STORAGE_KEY, JSON.stringify(collection('Local')));
    syncObjects.load.mockResolvedValue(null);
    renderProvider('android-capacitor');

    await waitFor(() => expect(syncObjects.load).toHaveBeenCalledWith('custom_css_snippets'));
    expect(screen.getByTestId('name')).toHaveTextContent('Local');
    expect(customStyleNode()?.textContent).toContain('color: red');
  });
});
