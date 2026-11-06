import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWorkspaceGridColumns, type WorkspaceGridColumnProps } from './workspaceLayoutGridContentColumns';

vi.mock('./WorkspaceLayoutGridSections', () => ({
  WorkspaceListArea: () => <input aria-label="List search" defaultValue="kept search" />,
  WorkspaceDocumentArea: () => <section data-workspace-document-focus-target tabIndex={-1}><input aria-label="Document" /></section>
}));
vi.mock('./WorkspaceRightSidebar', () => ({
  WorkspaceRightSidebar: () => <input aria-label="Assistant draft" defaultValue="kept draft" />
}));
vi.mock('./WorkspaceListSplitter', () => ({
  WorkspaceListSplitter: () => <div role="separator" aria-label="Resize list" tabIndex={0} />
}));
vi.mock('./WorkspaceRightSidebarSplitter', () => ({
  WorkspaceRightSidebarSplitter: () => <div role="separator" aria-label="Resize inspector" tabIndex={0} />
}));

function Shell({ collapsed = false, floating = false, immersive = false }: { collapsed?: boolean; floating?: boolean; immersive?: boolean }) {
  const props = {
    isListCollapsed: collapsed, isRightSidebarCollapsed: collapsed, isImmersiveMode: immersive,
    documentSurfaceProps: {}, studySessionCompleteSummaryProps: null,
    listAreaProps: {}, listSplitterProps: {}, rightSidebarProps: {}, rightSidebarSplitterProps: {},
    compactSidebars: { leftFloating: floating, rightFloating: floating, openSide: null, dismiss: () => {} }
  } as WorkspaceGridColumnProps;
  return <>
    <button data-workspace-sidebar-toggle="left">Left toggle</button>
    <button data-workspace-sidebar-toggle="right">Right toggle</button>
    {renderWorkspaceGridColumns(props)}
  </>;
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{ width: 30, height: 30 }] as unknown as DOMRectList);
});

describe.each([false, true])('sidebar close focus (floating=%s)', (floating) => {
  it.each([
    ['List search', 'Left toggle'], ['Assistant draft', 'Right toggle'],
    ...(floating ? [] : [['Resize list', 'Left toggle'], ['Resize inspector', 'Right toggle']])
  ])('returns focus from %s to its visible toggle', (label, toggle) => {
    const view = render(<Shell floating={floating} />);
    const input = screen.getByLabelText(label);
    input.focus();
    expect(input).toHaveFocus();
    view.rerender(<Shell collapsed floating={floating} />);
    expect(screen.getByRole('button', { name: toggle })).toHaveFocus();
    view.rerender(<Shell floating={floating} />);
    screen.getByLabelText(label).focus();
    expect(screen.getByLabelText(label)).toHaveFocus();
    expect(screen.getByLabelText('Assistant draft')).toHaveValue('kept draft');
    expect(screen.getByLabelText('List search')).toHaveValue('kept search');
  });

  it('leaves focus in the document when the sidebars close and reopen', () => {
    const view = render(<Shell floating={floating} />);
    const document = screen.getByLabelText('Document');
    document.focus();
    view.rerender(<Shell collapsed floating={floating} />);
    expect(document).toHaveFocus();
    view.rerender(<Shell floating={floating} />);
    expect(document).toHaveFocus();
  });
});

it('returns focus to the document when closing without a visible sidebar toggle', () => {
  const view = render(<Shell />);
  screen.getByLabelText('Assistant draft').focus();
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([] as unknown as DOMRectList);
  view.rerender(<Shell collapsed />);
  expect(view.container.querySelector('[data-workspace-document-focus-target]')).toHaveFocus();
});

it.each(['List search', 'Assistant draft'])('hands focus from %s to the document on immersion', (label) => {
  const view = render(<Shell />);
  screen.getByLabelText(label).focus();
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([] as unknown as DOMRectList);
  view.rerender(<Shell immersive />);
  expect(view.container.querySelector('[data-workspace-document-focus-target]')).toHaveFocus();
});
