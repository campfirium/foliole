import type { ReactNode } from 'react';

import type { PdfPageDimensions } from './pdfPageDimensions';

export function PdfPageFrame(props: {
  children: ReactNode;
  pageDimensions: PdfPageDimensions;
}) {
  return (
    <div className="pdf-document-page-frame shrink-0" data-testid="pdf-document-page-frame"
      style={props.pageDimensions}>
      {props.children}
    </div>
  );
}
