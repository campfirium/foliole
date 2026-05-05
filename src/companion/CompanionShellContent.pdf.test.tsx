import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderCompanionShellContent } from './CompanionShellContent';

vi.mock('./CompanionArticleDocument', () => ({
  CompanionArticleDocument: (props: { content: string; onMissingAttachmentResource?: (attachmentId: string) => void }) => (
    <article>
      {props.content}
      <button onClick={() => props.onMissingAttachmentResource?.('inline-att-1')}>Load inline attachment</button>
    </article>
  )
}));

vi.mock('@/features/pdf/components/SimplePdfDocument', () => ({
  SimplePdfDocument: (props: { onBackToText?: () => void }) => (
    <div>
      <div>PDF original viewer</div>
      <button onClick={props.onBackToText}>Text</button>
    </div>
  )
}));

const attachmentSyncMock = vi.hoisted(() => ({
  syncCompanionAttachmentResourceFromDesktop: vi.fn(async () => ({ attachmentId: 'inline-att-1', status: 'cached' }))
}));

vi.mock('@/shared/platform/companionDesktopAttachmentResources', () => attachmentSyncMock);

function createPdfReadableSurface() {
  return {
    activeAction: 'recent',
    browsedFolder: null,
    handleSelectBrowseNode: vi.fn(),
    handleSelectRecentArticle: vi.fn(),
    readableArticle: {
      content: '# Extracted PDF text\n\nReadable body',
      hideTitleHeading: false,
      nodeId: 'topic-1',
      pdfAttachmentId: 'pdf-attachment-1',
      textAnchorDecorations: [],
      title: 'Extracted PDF text'
    },
    recentArticles: [],
    selectedBrowseNodeId: 'topic-1'
  };
}

function createMissingBodySurface() {
  return {
    ...createPdfReadableSurface(),
    readableArticle: {
      bodyStatus: 'missing',
      content: '',
      hideTitleHeading: false,
      nodeId: 'topic-1',
      pdfAttachmentId: null,
      textAnchorDecorations: [],
      title: 'Synced topic'
    }
  };
}

function createEmptyBodySurface() {
  return {
    ...createPdfReadableSurface(),
    readableArticle: {
      bodyStatus: 'empty',
      content: '',
      hideTitleHeading: false,
      nodeId: 'topic-1',
      pdfAttachmentId: null,
      textAnchorDecorations: [],
      title: 'Empty topic'
    }
  };
}

function createFailedBodySurface() {
  return {
    ...createPdfReadableSurface(),
    readableArticle: {
      bodyStatus: 'failed',
      content: '',
      hideTitleHeading: false,
      nodeId: 'topic-1',
      pdfAttachmentId: null,
      textAnchorDecorations: [],
      title: 'Failed topic'
    }
  };
}

describe('CompanionShellContent PDF articles', () => {
  it('keeps extracted PDF text as the primary mobile reading surface', () => {
    render(renderCompanionShellContent({
      hasSnapshot: true,
      onBackToSettingsList: vi.fn(),
      onOpenSyncSettingsPage: vi.fn(),
      onOpenSyncSettings: vi.fn(),
      onSelectReviewBreadcrumbItem: vi.fn(),
      reviewBreadcrumbItems: [],
      settingsPage: 'list',
      surface: createPdfReadableSurface() as never,
      workspaceError: null,
      workspaceSync: {} as never
    }));

    expect(screen.getByText('Text version')).toBeInTheDocument();
    expect(screen.getByText(/Extracted PDF text/)).toBeInTheDocument();
    expect(screen.queryByText('PDF original viewer')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open PDF' }));

    expect(screen.getByText('PDF original viewer')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Text' }));
    expect(screen.getByText(/Extracted PDF text/)).toBeInTheDocument();
  });

  it('syncs a missing inline attachment from the current topic surface', () => {
    render(renderCompanionShellContent({
      hasSnapshot: true,
      onBackToSettingsList: vi.fn(),
      onOpenSyncSettingsPage: vi.fn(),
      onOpenSyncSettings: vi.fn(),
      onSelectReviewBreadcrumbItem: vi.fn(),
      reviewBreadcrumbItems: [],
      settingsPage: 'list',
      surface: createPdfReadableSurface() as never,
      workspaceError: null,
      workspaceSync: {
        state: {
          endpoint_url: 'http://10.0.2.2:38641',
          remembered_targets: []
        }
      } as never
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Load inline attachment' }));

    expect(attachmentSyncMock.syncCompanionAttachmentResourceFromDesktop).toHaveBeenCalledWith(
      'http://10.0.2.2:38641',
      'inline-att-1'
    );
  });

  it('shows a syncing state when the topic body blob is not local yet', () => {
    render(renderCompanionShellContent({
      hasSnapshot: true,
      onBackToSettingsList: vi.fn(),
      onOpenSyncSettingsPage: vi.fn(),
      onOpenSyncSettings: vi.fn(),
      onSelectReviewBreadcrumbItem: vi.fn(),
      reviewBreadcrumbItems: [],
      settingsPage: 'list',
      surface: createMissingBodySurface() as never,
      workspaceError: null,
      workspaceSync: {} as never
    }));

    expect(screen.getByText('Waiting for topic body.')).toBeInTheDocument();
    expect(screen.getByText('This device has the topic list, but this body has not reached the device yet.')).toBeInTheDocument();
  });

  it('shows an empty state when the selected topic has no body', () => {
    render(renderCompanionShellContent({
      hasSnapshot: true,
      onBackToSettingsList: vi.fn(),
      onOpenSyncSettingsPage: vi.fn(),
      onOpenSyncSettings: vi.fn(),
      onSelectReviewBreadcrumbItem: vi.fn(),
      reviewBreadcrumbItems: [],
      settingsPage: 'list',
      surface: createEmptyBodySurface() as never,
      workspaceError: null,
      workspaceSync: {} as never
    }));

    expect(screen.getByText('This topic is empty.')).toBeInTheDocument();
    expect(screen.queryByText('Waiting for topic body.')).not.toBeInTheDocument();
  });

  it('shows a retryable failed state when body blob sync fails validation', () => {
    render(renderCompanionShellContent({
      hasSnapshot: true,
      onBackToSettingsList: vi.fn(),
      onOpenSyncSettingsPage: vi.fn(),
      onOpenSyncSettings: vi.fn(),
      onSelectReviewBreadcrumbItem: vi.fn(),
      reviewBreadcrumbItems: [],
      settingsPage: 'list',
      surface: createFailedBodySurface() as never,
      workspaceError: null,
      workspaceSync: {} as never
    }));

    expect(screen.getByText('Topic body could not be loaded.')).toBeInTheDocument();
    expect(screen.getByText('Reconnect this device to desktop to retry.')).toBeInTheDocument();
  });
});
