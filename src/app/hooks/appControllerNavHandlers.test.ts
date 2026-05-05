import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createLayoutNav } from './appControllerNavHandlers';

describe('createLayoutNav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stores breadcrumb text target into reading position before opening ancestor node', () => {
    const handleSelectBreadcrumbNode = vi.fn();
    const onSelectNode = vi.fn();

    const nav = createLayoutNav({
      nav: {
        handleGoBack: vi.fn(),
        handleGoForward: vi.fn(),
        handleGoParent: vi.fn(),
        handleSelectBreadcrumbNode,
        handleSelectNode: vi.fn(),
        shouldSuppressSelectionRestore: vi.fn(() => false)
      },
      ws: {
        activeNodeId: 'child',
        nodeViewById: {},
        nodesById: {
          root: {
            id: 'root',
            parentNodeId: null,
            kind: 'topic',
            title: 'Root',
            content: 'Alpha Beta Gamma',
            anchorLink: null,
            reveal: null,
            review: null,
            createdAt: '',
            updatedAt: ''
          },
          child: {
            id: 'child',
            parentNodeId: 'root',
            kind: 'topic',
            title: 'Child',
            content: 'Child content',
            anchorLink: {
              id: 'hl-1',
              kind: 'highlight',
              locator: { from: 6, originalText: 'Beta', to: 10 }
            },
            reveal: null,
            review: null,
            createdAt: '',
            updatedAt: ''
          }
        },
      }
    } as never, onSelectNode);

    nav.onSelectBreadcrumbNode('root');

    expect(onSelectNode).toHaveBeenCalledWith('root', {
      id: 'hl-1',
      kind: 'highlight',
      locator: { from: 6, originalText: 'Beta', to: 10 }
    });
    expect(handleSelectBreadcrumbNode).not.toHaveBeenCalled();
  });

  it('routes pdf breadcrumb target through the shared node selection entry', () => {
    const handleSelectBreadcrumbNode = vi.fn();
    const onSelectNode = vi.fn();

    const nav = createLayoutNav({
      nav: {
        handleGoBack: vi.fn(),
        handleGoForward: vi.fn(),
        handleGoParent: vi.fn(),
        handleSelectBreadcrumbNode,
        handleSelectNode: vi.fn(),
        shouldSuppressSelectionRestore: vi.fn(() => false)
      },
      ws: {
        activeNodeId: 'pdf-highlight',
        nodeViewById: {},
        nodesById: {
          pdf: {
            id: 'pdf',
            parentNodeId: null,
            kind: 'topic',
            title: 'PDF',
            content: '',
            anchorLink: null,
            reveal: null,
            review: null,
            createdAt: '',
            updatedAt: ''
          },
          'pdf-highlight': {
            id: 'pdf-highlight',
            parentNodeId: 'pdf',
            kind: 'topic',
            title: 'PDF highlight',
            content: '',
            anchorLink: {
              id: 'pdf-hl-1',
              kind: 'highlight',
              locator: { page: 4, x: 0.2, y: 0.4 }
            },
            reveal: null,
            review: null,
            createdAt: '',
            updatedAt: ''
          }
        },
      }
    } as never, onSelectNode);

    nav.onSelectBreadcrumbNode('pdf');

    expect(onSelectNode).toHaveBeenCalledWith('pdf', {
      id: 'pdf-hl-1',
      kind: 'highlight',
      locator: { page: 4, x: 0.2, y: 0.4 }
    });
    expect(handleSelectBreadcrumbNode).not.toHaveBeenCalled();
  });
});
