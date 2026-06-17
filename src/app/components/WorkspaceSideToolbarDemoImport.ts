import { useRef } from 'react';

import { importDemoMarkdown, useDemoRuntimeState, type DemoMarkdownRuntimeEntry } from '../../shared/platform/runtime/demoRuntime';

export function useDemoMarkdownRailImport() {
  const demoState = useDemoRuntimeState();
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function importClipboardMarkdown() {
    const markdown = (await navigator.clipboard?.readText?.())?.trim();
    if (!markdown) return;
    await importDemoMarkdown([{ markdown, sourceName: 'Clipboard Markdown' }]);
  }

  async function importMarkdownFiles(files: FileList | null) {
    if (!files) return;
    const entries = await readDemoMarkdownFiles(Array.from(files));
    await importDemoMarkdown(entries);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return {
    fileInputRef,
    importClipboardMarkdown,
    importMarkdownFiles,
    isDemo: demoState.isDemo
  };
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
  return file.name.toLowerCase().endsWith('.md') && !path.split('/').some((segment) => segment.startsWith('.'));
}
