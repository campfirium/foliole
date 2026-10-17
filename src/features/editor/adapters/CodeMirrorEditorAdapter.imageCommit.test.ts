import { EditorView } from '@codemirror/view';
import { afterEach, expect, it, vi } from 'vitest';

import { handleClipboardImagePaste } from './clipboardImagePaste';
import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

const imported = vi.hoisted(() => vi.fn());
vi.mock('../../../shared/platform/attachmentImports', () => ({ importClipboardImageAttachment: imported }));
const editors: CodeMirrorEditorAdapter[] = [];
afterEach(() => { editors.splice(0).forEach(editor => editor.destroy()); document.body.replaceChildren(); });

it('carries the very first pasted image description through the real editor change buffer', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const changed = vi.fn(); const input = vi.fn();
  const editor = new CodeMirrorEditorAdapter(host, { initialContent: 'Original', onChange: changed, onDocumentInput: input });
  editors.push(editor); editor.setNodeId('topic');
  const root = host.querySelector<HTMLElement>('.cm-editor');
  const view = root ? EditorView.findFromDOM(root) : null;
  if (!view) throw new Error('editor_view_unavailable');
  const storageKey = `${'a'.repeat(64)}.png`;
  imported.mockResolvedValue({ status: 'imported', storage_key: storageKey, original_name: 'Source.png' });
  const file = new File(['png'], 'Source.png', { type: 'image/png' });
  expect(handleClipboardImagePaste({ getData: () => '', items: [
    { kind: 'file', type: 'image/png', getAsFile: () => file }
  ] }, view, 'topic')).toBe(true);
  await vi.waitFor(() => expect(editor.getContent()).toContain(`asset://${storageKey}`));
  editor.flushContentChanges();
  const description = { storage_key: storageKey, original_name: 'Source.png', role: 'image' };
  expect(changed).toHaveBeenLastCalledWith(editor.getContent(), { nodeId: 'topic', newImageReferences: [description] });
  expect(input).toHaveBeenLastCalledWith(expect.objectContaining({ newImageReferences: [description] }));
});
