import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MouseGestureSettingsProvider } from '../../features/settings/context/MouseGestureSettingsProvider';

import { DocumentSourceUpdatePanel } from './DocumentSourceUpdatePanel';

describe('DocumentSourceUpdatePanel integration', () => {
  it('renders the live two-pane comparison without crashing', () => {
    render(
      <MouseGestureSettingsProvider>
        <DocumentSourceUpdatePanel
          currentContent={'# Title\n\nSame\nLeft only\nEnd'}
          currentNodeId="node-1"
          documentMaxWidth={760}
          editorAppearanceKey="appearance-1"
          onCurrentContentChange={() => undefined}
          onOpenChange={() => undefined}
          open
          updatedContent={'# Title\n\nSame\nRight only\nEnd'}
        />
      </MouseGestureSettingsProvider>
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getByText('Updated Source')).toBeInTheDocument();
  });
});
