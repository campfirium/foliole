import { useEffect, useRef } from 'react';

import { importDemoMarkdown, useDemoRuntimeState, type DemoMarkdownRuntimeEntry } from '../../shared/platform/runtime/demoRuntime';

import { CLIPBOARD_IMPORT_REQUEST_EVENT, FILE_IMPORT_REQUEST_EVENT } from './importActivityRequests';

export function WorkspaceDemoImport() {
  const { isDemo } = useDemoRuntimeState();
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function importMarkdownFiles(files: FileList | null) {
    if (!files) return;
    const entries = await readDemoMarkdownFiles(Array.from(files));
    await importDemoMarkdown(entries);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  useEffect(() => {
    if (!isDemo) return undefined;
    const handleClipboardRequest = () => void importClipboardMarkdown();
    const handleFileRequest = (event: Event) => {
      openPicker(fileInputRef.current, event instanceof CustomEvent && event.detail === 'folder');
    };
    window.addEventListener(CLIPBOARD_IMPORT_REQUEST_EVENT, handleClipboardRequest);
    window.addEventListener(FILE_IMPORT_REQUEST_EVENT, handleFileRequest);
    return () => {
      window.removeEventListener(CLIPBOARD_IMPORT_REQUEST_EVENT, handleClipboardRequest);
      window.removeEventListener(FILE_IMPORT_REQUEST_EVENT, handleFileRequest);
    };
  }, [isDemo]);

  return isDemo ? (
    <input accept=".md,text/markdown,text/plain" hidden multiple type="file"
      onChange={event => void importMarkdownFiles(event.target.files)} ref={fileInputRef} />
  ) : null;
}

async function importClipboardMarkdown() {
  const markdown = (await navigator.clipboard?.readText?.())?.trim();
  if (!markdown) return;
  await importDemoMarkdown([{ markdown, sourceName: 'Clipboard Markdown' }]);
}

function openPicker(input: HTMLInputElement | null, folder: boolean) {
  if (!input) return;
  input.toggleAttribute('webkitdirectory', folder);
  input.click();
}

async function readDemoMarkdownFiles(files: File[]): Promise<DemoMarkdownRuntimeEntry[]> {
  const entries: DemoMarkdownRuntimeEntry[] = [];
  for (const file of files) {
    if (!isDemoMarkdownFile(file)) continue;
    const markdown = (await file.text()).trim();
    if (!markdown) continue;
    entries.push({
      markdown,
      relativePath: file.webkitRelativePath || file.name,
      sourceName: file.name
    });
  }
  return entries;
}

function isDemoMarkdownFile(file: File) {
  const path = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
  return /\.(md|txt)$/i.test(file.name) && !path.split('/').some((segment) => segment.startsWith('.'));
}
