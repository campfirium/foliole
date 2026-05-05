import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { documentPanelBodyMock, renderSectionWithProps } from './DocumentPanelSection.testSupport';

it('hides editor chrome and keeps the body read-only in immersive reading mode', () => {
  renderSectionWithProps({
    isImmersiveEditing: false,
    isImmersiveMode: true
  });

  expect(documentPanelBodyMock.mock.calls.at(-1)?.[0]).toMatchObject({
    readOnly: true
  });
  expect(typeof documentPanelBodyMock.mock.calls.at(-1)?.[0]?.onEditorDoubleClick).toBe('function');
  expect(documentPanelBodyMock.mock.calls.at(-1)?.[0]?.showDocumentOutline).not.toBe(false);
  expect(screen.queryByLabelText('More editor options')).toBeNull();
  expect(screen.queryByPlaceholderText('Search topic…')).toBeNull();
});

it('restores editing inside immersive mode when temporary edit is enabled', () => {
  renderSectionWithProps({
    isImmersiveEditing: true,
    isImmersiveMode: true
  });

  expect(documentPanelBodyMock.mock.calls.at(-1)?.[0]).toMatchObject({
    readOnly: false
  });
});
