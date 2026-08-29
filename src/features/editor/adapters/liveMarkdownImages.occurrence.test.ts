import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import {
  registerImageClozeEditorPresentation,
  unregisterImageClozeEditorPresentation
} from '../../image-cloze/model/imageClozePresentation';

vi.mock('../../../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: vi.fn(() => null) }));
vi.mock('../../../shared/platform/bridge', () => ({ openExternalUrl: vi.fn() }));

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

let adapter: CodeMirrorEditorAdapter | null = null;

beforeEach(() => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility, 'hidden');
});

afterEach(() => {
  unregisterImageClozeEditorPresentation('node-1');
  adapter?.destroy();
  adapter = null;
  document.body.replaceChildren();
  window.localStorage.clear();
});

it('projects an occurrence-bound image excerpt only onto the exact repeated image range', async () => {
  const imageMarkdown = '![Cover](asset://hash-1.png)';
  const content = `${imageMarkdown}\nBetween\n${imageMarkdown}`;
  const secondFrom = content.lastIndexOf(imageMarkdown);
  const host = document.createElement('div');
  document.body.append(host);
  adapter = new CodeMirrorEditorAdapter(host, { initialContent: content });
  adapter.setNodeId('node-1');
  const onOpenNode = vi.fn();
  registerImageClozeEditorPresentation('node-1', {
    canCreate: true,
    focusRegionId: null,
    hiddenRegionIds: [],
    onOpenNode,
    outlinedRegionIds: ['excerpt-region'],
    regions: [{
      attachmentId: 'hash-1', height: 0.2, id: 'excerpt-region',
      imageRange: { from: secondFrom, to: secondFrom + imageMarkdown.length },
      openNodeId: 'excerpt-1', width: 0.3, x: 0.1, y: 0.2
    }]
  });
  adapter.refreshImageClozePresentation();

  await waitFor(() => {
    const widgets = Array.from(host.querySelectorAll<HTMLElement>('.cm-md-image-widget'));
    expect(widgets).toHaveLength(2);
    expect(widgets[0]?.querySelector('[data-region-id="excerpt-region"]')).toBeNull();
    expect(widgets[1]?.querySelector('[data-region-id="excerpt-region"]')).not.toBeNull();
  });

  const secondWidget = host.querySelectorAll<HTMLElement>('.cm-md-image-widget')[1]!;
  const overlay = secondWidget.querySelector<HTMLElement>('.cm-md-image-cloze-overlay')!;
  vi.spyOn(overlay, 'getBoundingClientRect').mockReturnValue({
    bottom: 100, height: 100, left: 0, right: 100, top: 0, width: 100, x: 0, y: 0,
    toJSON: () => ({})
  });
  secondWidget.querySelector<HTMLElement>('[data-region-id="excerpt-region"]')?.dispatchEvent(
    new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 20 })
  );
  expect(onOpenNode).toHaveBeenCalledWith('excerpt-1');
});
