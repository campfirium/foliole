import { expect, it } from 'vitest';

import { registerImageClozeEditorPresentation, unregisterImageClozeEditorPresentation } from '../../image-cloze/model/imageClozePresentation';

import { createImageSurface } from './liveMarkdownImageSurface';

it('keeps creation disabled for an image with no existing regions on a read-only surface', () => {
  registerImageClozeEditorPresentation('readonly', { canCreate: false, regions: [], outlinedRegionIds: [], hiddenRegionIds: [] });
  try {
    const surface = createImageSurface({ attachmentId: 'hash', alt: 'Diagram', display: 'block', from: 0, to: 20, source: 'asset://diagram.png' }, 'image.png', 'readonly');
    surface.dispatchEvent(new Event('pointerenter'));
    expect(surface.querySelector('button[aria-label="Confirm image cloze"]')).toBeNull();
  } finally { unregisterImageClozeEditorPresentation('readonly'); }
});
