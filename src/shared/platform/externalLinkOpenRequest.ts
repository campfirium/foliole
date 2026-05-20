export type ExternalLinkOpenTarget = 'browser' | 'panel';

export interface ExternalLinkOpenRequest {
  anchorPoint?: {
    x: number;
    y: number;
  };
  href: string;
  target?: ExternalLinkOpenTarget;
}
