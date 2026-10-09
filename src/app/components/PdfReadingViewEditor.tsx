import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useState } from 'react';
import { Page } from 'react-pdf';

import { usePdfReadingView } from '../../features/pdf/components/PdfReadingViewContext';
import { FULL_PDF_VIEW, type PdfViewRect } from '../../features/pdf/model/pdfReadingView';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppButton,
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogTitle
} from '../../shared/ui';

import { PdfViewRangeSelection } from './PdfViewRangeSelection';

export function PdfReadingViewEditor(props: { pdf: PDFDocumentProxy }) {
  const runtime = usePdfReadingView();
  const t = useTranslation();
  const [rect, setRect] = useState(runtime?.view.manual ?? FULL_PDF_VIEW);
  const [hasSelection, setHasSelection] = useState(Boolean(runtime?.view.manual));
  const pageNumber = runtime?.page ?? 1;
  const size = useEditorPageSize(props.pdf, pageNumber);
  if (!runtime) return null;
  return (
    <AppDialog
      open
      onOpenChange={(open) => {
        if (!open) runtime.cancel();
      }}
    >
      <AppDialogContent className="flex max-h-[95vh] max-w-[95vw] flex-col gap-3 p-4">
        <AppDialogTitle>{t('desktop.pdf.view.adjust')}</AppDialogTitle>
        <AppDialogDescription>{t('desktop.pdf.view.selectHint')}</AppDialogDescription>
        {size.width > 0 ? (
          <div className="relative mx-auto" style={size}>
            <Page
              pageNumber={pageNumber}
              width={size.width}
              rotate={0}
              renderTextLayer={false}
              renderAnnotationLayer={false}
            />
            <PdfViewRangeSelection
              rect={rect}
              drawOnBody={!hasSelection}
              onChange={(value) => {
                setRect(value);
                setHasSelection(true);
              }}
            />
          </div>
        ) : null}
        {runtime.error ? (
          <p role="alert" className="text-error">
            {t('desktop.pdf.view.failed')}
          </p>
        ) : null}
        <EditorActions rect={rect} />
      </AppDialogContent>
    </AppDialog>
  );
}

function useEditorPageSize(pdf: PDFDocumentProxy, pageNumber: number) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    let active = true;
    const measure = async () => {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const scale = Math.min(
        (window.innerWidth - 110) / viewport.width,
        (window.innerHeight - 200) / viewport.height,
        1.5
      );
      if (active)
        setSize({
          width: Math.floor(viewport.width * scale),
          height: Math.floor(viewport.height * scale)
        });
    };
    void measure();
    window.addEventListener('resize', measure);
    return () => {
      active = false;
      window.removeEventListener('resize', measure);
    };
  }, [pageNumber, pdf]);
  return size;
}

function EditorActions(props: { rect: PdfViewRect }) {
  const runtime = usePdfReadingView();
  const t = useTranslation();
  const rect = props.rect;
  if (!runtime) return null;
  return (
    <div className="flex justify-end gap-2">
      <AppButton disabled={runtime.busy} onClick={runtime.cancel}>
        {t('desktop.pdf.view.cancel')}
      </AppButton>
      <AppButton
        disabled={rect.width < 0.01 || rect.height < 0.01 || runtime.busy}
        onClick={() => {
          void runtime.confirm(rect);
        }}
      >
        {t('desktop.pdf.view.confirm')}
      </AppButton>
    </div>
  );
}
