import { GENERATED_GUIDE_PACK } from './generated/guidePack';
import { guidePackToWebGuides, type WebGuideSection, type WebGuideSeed } from './guidePack';

export type { WebGuideSection, WebGuideSeed };

export const WEB_GUIDES = guidePackToWebGuides(GENERATED_GUIDE_PACK);
export const DEFAULT_WEB_GUIDE = WEB_GUIDES[0];

export function canonicalGuidePath(slug: string) {
  return `/guides/${slug}/`;
}
