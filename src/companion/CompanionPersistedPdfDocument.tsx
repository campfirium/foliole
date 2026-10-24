import { lazy, useCallback, useRef, type ComponentProps } from 'react';

import type { SimplePdfDocument } from '../features/pdf/components/SimplePdfDocument';
import type { SimplePdfPosition } from '../features/pdf/components/useSimplePdfPosition';

import { useCompanionNavigationField } from './CompanionNavigationProvider';

const PdfDocument = lazy(() => import('../features/pdf/components/SimplePdfDocument')
  .then(module => ({ default: module.SimplePdfDocument })));

export function CompanionPersistedPdfDocument(props: ComponentProps<typeof SimplePdfDocument>) {
  const [positions, setPositions] = useCompanionNavigationField('pdfPositionById', {});
  // Changes from scrolling are saved, but do not become new restore commands in this reader.
  const initial = useRef(positions[props.attachmentId]);
  const onChange = useCallback((position: SimplePdfPosition) => {
    setPositions(current => ({ ...current, [props.attachmentId]: position }));
  }, [props.attachmentId, setPositions]);
  return <PdfDocument {...props} positionPersistence={{ initial: initial.current, onChange }} />;
}
