export interface MarkdownImageMatch {
  attachmentId: string | null;
  alt: string;
  display: 'block' | 'inline';
  displayWidth?: number;
  from: number;
  linkHref?: string;
  source: string;
  to: number;
}
