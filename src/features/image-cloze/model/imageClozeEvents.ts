import type { ImageClozeDraftRegion } from './imageCloze';

export const IMAGE_CLOZE_CREATE_EVENT = 'foliole:image-cloze-create';

export interface ImageClozeCreateEventDetail {
  attachmentId: string;
  imageRange: {
    from: number;
    to: number;
  };
  region: ImageClozeDraftRegion;
}
