import type { ImageClozeDraftRegion } from './imageCloze';
import type { ImageClozeRegionEdit } from './imageClozeRegionEdit';

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

export const IMAGE_CLOZE_EDIT_EVENT = 'foliole:image-cloze-edit';

export interface ImageClozeEditEventDetail {
  edit: ImageClozeRegionEdit;
  respond: (saved: Promise<boolean>) => void;
}
