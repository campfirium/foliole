import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../../src/app/styles.css';
import '../../src/companion/companionMinimal.css';
import { CompanionCaptureSheet } from '../../src/companion/CompanionCaptureSheet';
import { SimplePdfDocument } from '../../src/features/pdf/components/SimplePdfDocument';
import { LocalizationProvider } from '../../src/shared/localization/LocalizationProvider';
import { prepareSelectedTextImport } from '../../src/shared/platform/import/selectedImportFile';
import { extractRuntimePdfPageText } from '../../src/shared/platform/runtime/pdfPageTextExtraction';

function FileImportFixture() {
  const [open, setOpen] = useState(false);
  const [imported, setImported] = useState('');
  const [readingMode, setReadingMode] = useState('');
  const [pdf, setPdf] = useState<{ attachmentId: string; title: string } | null>(null);
  return <LocalizationProvider initialLanguagePreference="en">
    <button onClick={() => setOpen(true)}>Open capture</button>
    <output aria-label="Saved reading mode">{readingMode}</output>
    <article aria-label="Imported topic">{imported}</article>
    {pdf ? <SimplePdfDocument {...pdf} /> : null}
    <CompanionCaptureSheet draftScope="file-layout" open={open} onOpenChange={setOpen}
      onSave={async () => ({ nodeId: 'manual-topic' })}
      onImportFile={async file => {
        const prepared = await prepareSelectedTextImport(file);
        setImported(prepared.epubBook
          ? [prepared.content, ...prepared.epubBook.chapters.map(chapter => chapter.content)].join('\n\n')
          : prepared.content);
        if (prepared.pdfSource) {
          const source = URL.createObjectURL(new Blob([Uint8Array.from(prepared.pdfSource.bytes)], { type: 'application/pdf' }));
          // The fixture supplies only the native file URL boundary; PDF parsing and rendering stay real.
          Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
            invoke: async () => ({ status: 'ready', resource_url: source })
          } });
          setPdf({ attachmentId: prepared.pdfSource.storageKey.slice(0, 64), title: prepared.title });
          const pages = await extractRuntimePdfPageText(prepared.pdfSource.bytes);
          setImported(pages.map(page => page.text).join('\n\n'));
        }
        return { nodeId: 'file-topic', ...(prepared.epubBook ? { epubReadingMode: { fileName: file.name,
          apply: async (mode: 'sequential' | 'free') => { setReadingMode(mode); } } } : {}), ...(prepared.importWarning ? { importWarning: prepared.importWarning } : {}) };
      }} />
  </LocalizationProvider>;
}

createRoot(document.getElementById('root')!).render(<FileImportFixture />);
