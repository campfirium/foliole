import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

const originalCanvasGetContext = HTMLCanvasElement.prototype.getContext;

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value(contextId: string) {
      if (contextId !== '2d') {
        return null;
      }
      return {
        font: '',
        measureText(text: string) {
          return { width: text.length * 8 };
        }
      };
    }
  });
});

afterAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: originalCanvasGetContext
  });
});

beforeEach(() => {
  window.localStorage.clear();
  delete window.electronAPI;
});

it('restores settings preview mode on any keydown', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

  await waitFor(() => {
    expect(screen.getByLabelText('Settings dialog').className).toContain('opacity-0');
  });

  fireEvent.keyDown(window, { key: 'a' });

  await waitFor(() => {
    expect(screen.getByLabelText('Settings dialog').className).not.toContain('opacity-0');
  });
});
