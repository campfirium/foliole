import { expect, it } from 'vitest';

import { appendAssistantImageFiles } from './workspaceRightSidebarAssistantImages';

it('reads a supported image into a native assistant draft', async () => {
  const file = new File([
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ], 'diagram.png', { type: 'image/png' });

  await expect(appendAssistantImageFiles([], [file])).resolves.toEqual({
    error: null,
    images: [{
      contentBase64: 'iVBORw0KGgo=',
      mimeType: 'image/png',
      originalName: 'diagram.png',
      sizeBytes: 8
    }]
  });
});

it('rejects unsupported and oversized image drafts before sending', async () => {
  const unsupported = new File(['gif'], 'diagram.gif', { type: 'image/gif' });
  await expect(appendAssistantImageFiles([], [unsupported])).resolves.toMatchObject({ error: 'type' });

  const oversized = new File([new Uint8Array(3 * 1024 * 1024 + 1)], 'large.png', {
    type: 'image/png'
  });
  await expect(appendAssistantImageFiles([], [oversized])).resolves.toMatchObject({ error: 'size' });
});
