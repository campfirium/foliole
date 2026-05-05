import type { MutableRefObject } from 'react';

import type { PdfJumpRequest } from '../../features/pdf/model/pdfSystemApi';

export const PAGE_JUMP_SCROLL_GUARD_MS = 400;

export interface ProgrammaticPageJumpState {
  expiresAt: number;
  requestId: number;
  targetPage: number;
}

export type ProgrammaticPageJumpRef = MutableRefObject<ProgrammaticPageJumpState | null>;

export function armProgrammaticPageJumpGuard(programmaticPageJumpRef: ProgrammaticPageJumpRef | undefined, pageJumpRequest: PdfJumpRequest) {
  if (!programmaticPageJumpRef) {
    return;
  }
  programmaticPageJumpRef.current = {
    expiresAt: Date.now() + PAGE_JUMP_SCROLL_GUARD_MS,
    requestId: pageJumpRequest.id,
    targetPage: pageJumpRequest.page
  };
}

export function shouldSkipVisiblePageSync(
  programmaticPageJumpRef: ProgrammaticPageJumpRef | undefined,
  visiblePage: number,
  now = Date.now()
) {
  const pageJumpGuard = programmaticPageJumpRef?.current;
  if (!pageJumpGuard) {
    return false;
  }
  if (now > pageJumpGuard.expiresAt) {
    programmaticPageJumpRef.current = null;
    return false;
  }
  if (visiblePage !== pageJumpGuard.targetPage) {
    return true;
  }
  programmaticPageJumpRef.current = null;
  return false;
}
