import type { PdfJumpRequest } from '../../features/pdf/model/pdfSystemApi';

import type { PdfPageElementsRef } from './PdfDocumentViewportParts';
import { isReadyPageElement, resolvePageJumpTop, scrollContainerToTop } from './pdfPageJumpScroll';

export function observePendingPageJump(args: {
  container: HTMLDivElement;
  onPageJumpHandled: (requestId: number) => void;
  pageElementsRef: PdfPageElementsRef;
  pageJumpRequest: PdfJumpRequest;
  positionY: number | null;
}) {
  let hasAlignedToPlaceholder = false;
  let jumpHandled = false;

  const tryHandleJump = () => {
    if (jumpHandled) {
      return true;
    }
    const target = args.pageElementsRef.current[args.pageJumpRequest.page];
    if (!target) {
      return false;
    }
    const targetTop = resolvePageJumpTop(args.container, target, args.positionY);
    if (!isReadyPageElement(target)) {
      if (!hasAlignedToPlaceholder) {
        hasAlignedToPlaceholder = true;
        scrollContainerToTop(args.container, targetTop, 'auto');
      }
      return false;
    }
    jumpHandled = true;
    scrollContainerToTop(args.container, targetTop, 'auto');
    args.onPageJumpHandled(args.pageJumpRequest.id);
    return true;
  };

  if (tryHandleJump()) {
    return undefined;
  }

  const observer = new MutationObserver(() => {
    if (tryHandleJump()) {
      observer.disconnect();
    }
  });
  observer.observe(args.container, {
    attributeFilter: ['data-pdf-page-state'],
    attributes: true,
    childList: true,
    subtree: true
  });
  return () => {
    observer.disconnect();
  };
}
