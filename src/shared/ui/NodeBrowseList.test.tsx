import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../localization/testLocalization';

import { NodeBrowseList } from './NodeBrowseList';

describe('NodeBrowseList', () => {
  it('renders folder and topic rows as companion node list items', () => {
    renderWithLocalization(
      <NodeBrowseList
        currentNodeId="topic-1"
        emptyLabel="No topics"
        items={[
          { kind: 'folder', nodeId: 'folder-1', preview: null, title: 'Folder A' },
          { bodyStatus: 'failed', kind: 'topic', nodeId: 'topic-1', preview: 'Opening text', title: 'Topic A' }
        ]}
        onSelectNode={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Open folder Folder A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open topic Topic A' })).toHaveClass('bg-companion-subtle');
    expect(screen.getByText('Opening text')).toHaveClass('line-clamp-1');
    expect(screen.getByText('Topic body unavailable')).toBeInTheDocument();
    expect(document.querySelectorAll('svg')).toHaveLength(4);
  });

  it('keeps the empty state simple', () => {
    render(<NodeBrowseList currentNodeId={null} emptyLabel="No topics" items={[]} onSelectNode={vi.fn()} />);

    expect(screen.getByText('No topics')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
