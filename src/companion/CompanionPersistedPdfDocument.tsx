import { lazy, useCallback, useRef, type ComponentProps } from 'react';

import type { SimplePdfDocument } from '../features/pdf/components/SimplePdfDocument';
import type { SimplePdfPosition } from '../features/pdf/components/useSimplePdfPosition';
import { isPdfOriginalUnsupported } from '../shared/platform/runtime/pdfOriginalSupport';

import { useCompanionNavigationField } from './CompanionNavigationProvider';
import { CompanionPdfErrorBoundary } from './CompanionPdfErrorBoundary';
import { CompanionPdfUnavailable } from './CompanionPdfUnavailable';

const PdfDocument = lazy(() => import('../features/pdf/components/SimplePdfDocument')
  .then(module => ({ default: module.SimplePdfDocument })));

export function CompanionPersistedPdfDocument(props: ComponentProps<typeof SimplePdfDocument>) {
  const [positions, setPositions] = useCompanionNavigationField('pdfPositionById', {});
  // Changes from scrolling are saved, but do not become new restore commands in this reader.
  const initial = useRef(positions[props.attachmentId]);
  const onChange = useCallback((position: SimplePdfPosition) => {
    setPositions(current => ({ ...current, [props.attachmentId]: position }));
  }, [props.attachmentId, setPositions]);
  const fallback = <CompanionPdfUnavailable outdated={false}
    onBack={props.onBackToText} backLabel={props.backLabel} />;
  if (isPdfOriginalUnsupported()) return <CompanionPdfUnavailable outdated
    onBack={props.onBackToText} backLabel={props.backLabel} />;
  return <CompanionPdfErrorBoundary key={props.attachmentId} fallback={fallback}>
    <PdfDocument {...props} positionPersistence={{ initial: initial.current, onChange }} />
  </CompanionPdfErrorBoundary>;
}
