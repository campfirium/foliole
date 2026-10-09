import { useEffect } from 'react';
import { useDocumentContext } from 'react-pdf';

import { usePdfReadingView } from '../../features/pdf/components/PdfReadingViewContext';
import { PdfTopBarsDocumentConnection } from '../../features/pdf/components/PdfTopBarsDocument';

import { PdfReadingViewEditor } from './PdfReadingViewEditor';

export function PdfReadingViewDocument() {
  const runtime = usePdfReadingView();
  return <>
    {runtime ? <ReadingViewDocument /> : null}
    <PdfTopBarsDocumentConnection />
  </>;
}
function ReadingViewDocument() {
  const context = useDocumentContext();
  const runtime = usePdfReadingView();
  const pdf = context?.pdf;
  useEffect(() => {
    if (pdf && runtime) void runtime.initialize(pdf);
  }, [pdf, runtime]);
  return pdf && runtime?.editing ? <PdfReadingViewEditor pdf={pdf} /> : null;
}
