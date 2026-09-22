import { expect, it, vi } from 'vitest';

import { collectPdfPageDimensions } from './pdfViewportPageLayout';

it('keeps persisted dimensions and loads only missing pages', async () => {
  const getPage = vi.fn(async (pageNumber: number) => ({
    getViewport: () => ({ height: pageNumber * 200, width: pageNumber * 100 })
  }));

  const dimensions = await collectPdfPageDimensions(
    { getPage, numPages: 3 },
    { 1: { height: 800, width: 600 } }
  );

  expect(getPage).toHaveBeenCalledTimes(2);
  expect(getPage).toHaveBeenCalledWith(2);
  expect(getPage).toHaveBeenCalledWith(3);
  expect(dimensions).toEqual({
    1: { height: 800, width: 600 },
    2: { height: 400, width: 200 },
    3: { height: 600, width: 300 }
  });
});
