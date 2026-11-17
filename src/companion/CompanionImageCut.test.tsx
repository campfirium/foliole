import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { invalidateCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';

import { CompanionArticleDocument } from './CompanionArticleDocument';

const clipboard = vi.hoisted(() => ({ writeClipboardText: vi.fn() }));
vi.mock('../shared/platform/companion/runtime/textClipboard', () => clipboard);
vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () => async (command: string) =>
  command === 'resolve_attachment_resource' ? { status: 'ready', resource_url: 'https://example.com/image.png', mime_type: 'image/png' } : { intrinsic_size: null } }));

const image = `![Diagram|320](asset://${'a'.repeat(64)}.png)`;
const original = `Before\n\n${image}\n\nAfter`;
Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
beforeEach(() => clipboard.writeClipboardText.mockReset().mockResolvedValue(undefined));
afterEach(cleanup);

async function renderDocument(content = original) {
  let editor: EditorAdapter | null = null;
  const onChange = vi.fn();
  const document = (nodeId = 'source', editing = true) => <MouseGestureSettingsProvider>
    <CompanionArticleDocument nodeId={nodeId} content={content} {...(editing ? { onChange } : {})}
      onEditorReady={value => { editor = value; }} />
  </MouseGestureSettingsProvider>;
  const view = renderWithLocalization(document());
  await waitFor(() => expect(view.container.querySelector('.cm-md-image-widget')).not.toBeNull());
  return { ...view, document, onChange, get editor() { return editor!; },
    get widget() { return view.container.querySelector<HTMLElement>('.cm-md-image-widget')!; } };
}

function beginCut(widget: HTMLElement) {
  let finish!: () => void;
  clipboard.writeClipboardText.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
  fireEvent.contextMenu(widget);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Cut image' }));
  return finish;
}

it('cuts only after clipboard success and pastes to another position in the same editor', async () => {
  const view = await renderDocument();
  const finish = beginCut(view.widget);
  expect(view.editor.getContent()).toBe(original);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Cut image' }));
  expect(clipboard.writeClipboardText).toHaveBeenCalledExactlyOnceWith(image);
  await act(async () => finish());
  expect(view.editor.getContent()).toBe('Before\n\n\n\nAfter');
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  act(() => view.editor.setSelection({ from: 0, to: 0 }));
  fireEvent.paste(view.container.querySelector('.cm-content')!, { clipboardData: {
    getData: (type: string) => type === 'text/plain' ? `${image}\n\n` : '', items: []
  } });
  expect(view.editor.getContent()).toBe(`${image}\n\nBefore\n\n\n\nAfter`);
  await waitFor(() => expect(view.container.querySelectorAll('.cm-md-image-widget')).toHaveLength(1));
});

it('retains the image on clipboard failure and allows retry', async () => {
  const view = await renderDocument();
  clipboard.writeClipboardText.mockRejectedValueOnce(new Error('Denied'));
  fireEvent.contextMenu(view.widget);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Cut image' }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(view.editor.getContent()).toBe(original);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Cut image' }));
  await waitFor(() => expect(view.editor.getContent()).toBe('Before\n\n\n\nAfter'));
});

it.each(['edit', 'restore-identical', 'switch', 'leave-editing', 'readonly', 'library', 'unmount'] as const)(
  'does not delete after %s while clipboard writing is pending', async action => {
    const view = await renderDocument(`${original}\n\n${image}`);
    const source = view.editor;
    const finish = beginCut(view.widget);
    let expected = source.getContent();
    if (action === 'edit' || action === 'restore-identical') {
      act(() => source.replaceRange(0, 0, 'Changed\n'));
      if (action === 'restore-identical') act(() => source.replaceRange(0, 'Changed\n'.length, ''));
      expected = source.getContent();
    }
    if (action === 'switch') view.rerender(view.document('other'));
    if (action === 'leave-editing') {
      view.rerender(view.document('source', false));
      view.rerender(view.document());
    }
    if (action === 'library') act(() => invalidateCompanionReadingScope());
    if (action === 'readonly') act(() => source.setReadOnly?.(true));
    if (action === 'unmount') view.unmount();
    await act(async () => finish());
    if (action !== 'unmount') expect(view.editor.getContent()).toBe(expected);
  }
);

it('removes only the pressed occurrence when identical image sources appear twice', async () => {
  const content = `Before\n\n${image}\n\nMiddle\n\n${image}\n\nAfter`;
  const view = await renderDocument(content);
  fireEvent.contextMenu(view.container.querySelectorAll('.cm-md-image-widget')[1]!);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Cut image' }));
  await waitFor(() => expect(view.editor.getContent()).toBe(`Before\n\n${image}\n\nMiddle\n\n\n\nAfter`));
});

it('cuts an image-only link together with its link wrapper', async () => {
  const linked = `[${image}](https://example.com)`;
  const view = await renderDocument(`Before\n\n${linked}\n\nAfter`);
  fireEvent.contextMenu(view.widget);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Cut image' }));
  await waitFor(() => expect(view.editor.getContent()).toBe('Before\n\n\n\nAfter'));
  expect(clipboard.writeClipboardText).toHaveBeenCalledExactlyOnceWith(linked);
});

it('cuts a reference image as self-contained Markdown without deleting shared definitions', async () => {
  const asset = `asset://${'b'.repeat(64)}.png`;
  const content = `Before\n\n[![Diagram|320][pic] caption](https://example.com)\n\n[pic]: ${asset} "Title"`;
  const view = await renderDocument(content);
  fireEvent.contextMenu(view.widget);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Cut image' }));
  await waitFor(() => expect(view.editor.getContent()).toBe(`Before\n\n[ caption](https://example.com)\n\n[pic]: ${asset} "Title"`));
  expect(clipboard.writeClipboardText).toHaveBeenCalledExactlyOnceWith(`![Diagram|320](${asset} "Title")`);
});
