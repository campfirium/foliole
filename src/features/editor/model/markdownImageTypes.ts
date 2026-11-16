import type { ImageFocusRect } from './markdownImageFocus';

export interface MarkdownImageMatch {
  attachmentId: string | null;
  alt: string;
  display: 'block' | 'inline';
  crop?: ImageFocusRect;
  displayWidth?: number;
  focus?: ImageFocusRect;
  focusEditable?: false;
  from: number;
  linkHref?: string;
  source: string;
  to: number;
}
