import { describe, expect, it } from 'vitest';

import {
  ACTIONS,
  analyzeActionResult,
  formatActionReport,
  resolveArgs
} from './collect-render-action-diagnostics.mjs';

describe('collect render action diagnostics', () => {
  it('defaults to switch-node action', () => {
    const args = resolveArgs(['node', 'script']);

    expect(args.action).toBe(ACTIONS.switchNode);
    expect(args.json).toBe(false);
    expect(args.settleMs).toBeGreaterThan(0);
  });

  it('parses explicit action and json mode', () => {
    const args = resolveArgs(['node', 'script', '--action', 'scroll-editor', '--json']);

    expect(args.action).toBe(ACTIONS.scrollEditor);
    expect(args.json).toBe(true);
  });

  it('supports dom-mutation-only actions', () => {
    const result = analyzeActionResult(ACTIONS.toggleRightSidebar, {
      counts: {
        documentPanel: 2,
        nodeListTree: 1,
        rightSidebar: 18,
        workspaceGrid: 6
      },
      state: {
        rightSidebarVisible: false,
        treeExpandedCount: 2
      },
      traces: []
    });

    expect(result.countSource).toBe('dom-mutations');
    expect(result.domState).toEqual({
      rightSidebarVisible: false,
      treeExpandedCount: 2
    });
    expect(result.verdict).toBe('quiet');
  });

  it('marks noisy scroll actions as suspicious', () => {
    const result = analyzeActionResult(ACTIONS.scrollEditor, {
      flow: {
        renderedRowCount: 128
      },
      totals: {
        documentPanel: 9,
        nodeListTree: 5,
        rightSidebar: 4,
        workspaceGrid: 3
      },
      traces: [
        { event: 'reading-progress.capture-scroll' },
        { event: 'reading-progress.debounce-fired' },
        { event: 'editor.viewport.set-scroll-top' }
      ],
      viewState: {
        scrollTop: 880
      }
    });

    expect(result.verdict).toBe('suspicious');
    expect(result.suspicious).toEqual(expect.arrayContaining([
      'main workspace refreshed 3 times',
      'node list refreshed 5 times',
      'node rows re-rendered 128 times'
    ]));
    expect(result.interestingTraces).toHaveLength(3);
    expect(result.countSource).toBe('accumulated');
  });

  it('formats a readable report', () => {
    const report = formatActionReport({
      action: ACTIONS.switchNode,
      interestingTraces: [{ event: 'selection_requested' }, { event: 'document_panel_bound' }],
      suspicious: ['node list refreshed 12 times'],
      totals: {
        documentPanel: 7,
        nodeListTree: 12,
        rightSidebar: 4,
        workspaceGrid: 4
      },
      countSource: 'current-flow',
      domState: null,
      verdict: 'suspicious',
      viewState: null
    });

    expect(report).toContain('Action: Switch node');
    expect(report).toContain('Verdict: suspicious refresh detected');
    expect(report).toContain('Counts (current-flow):');
    expect(report).toContain('- node list refreshed 12 times');
    expect(report).toContain('- selection_requested');
  });
});
