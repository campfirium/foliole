import type { ImageClozeDraftRegion } from './imageCloze';

export const IMAGE_CLOZE_CREATE_EVENT = 'foliole:image-cloze-create';
export const IMAGE_CLOZE_DELETE_EVENT = 'foliole:image-cloze-delete';

export interface ImageClozeCreateEventDetail {
  attachmentId: string;
  imageRange: {
    from: number;
    to: number;
  };
  regions: ImageClozeDraftRegion[];
}

export interface ImageClozeDeleteEventDetail {
  attachmentId: string;
  regionId: string;
}
