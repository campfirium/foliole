import type { Node } from '../../features/nodes/model/nodeTypes';
import type { RuntimeReadwiseBooksInventory } from '../../shared/platform/readwiseBooksRuntimeRepository';

import { PdfInventoryItem, ReadwiseBookInventoryItem } from './ImportInventoryListItems';
import { InboxImportedNodeRow, InboxRecentRunRow } from './ImportOverviewSections';

function formatDateLabel(value: string) {
  return value.replace('T', ' ').slice(0, 16);
}

type SortedInboxNodeItem = {
  entry: Parameters<typeof InboxImportedNodeRow>[0]['entry'];
  sortLastOpened: string | null;
  sortSaved: string;
  sortTitle: string;
};

type SortedInboxRunItem = {
  entry: Parameters<typeof InboxRecentRunRow>[0]['entry'];
  sortLastOpened: string | null;
  sortSaved: string;
  sortTitle: string;
};

type SortedBookItem = {
  book: RuntimeReadwiseBooksInventory['books'][number];
  sortLastOpened: string | null;
  sortSaved: string;
  sortTitle: string;
};

type SortedPdfItem = {
  item: Parameters<typeof PdfInventoryItem>[0]['item'];
  sortLastOpened: string | null;
  sortSaved: string;
  sortTitle: string;
};

function SectionBlock(props: { children: React.ReactNode; count: number; title: string }) {
  return (
    <section className="pt-5 first:pt-0">
      <div className="mb-3 flex items-baseline gap-2">
        <h3 className="text-sm font-semibold text-foreground">{props.title}</h3>
        <p className="text-sm text-foreground/58">{props.count}</p>
      </div>
      <ul className="flex flex-col divide-y divide-[var(--workspace-region-main-document-content-divider)] border-b border-[var(--workspace-region-main-document-content-divider)]">{props.children}</ul>
    </section>
  );
}

function InboxOverviewSection(props: {
  nodesById: Record<string, Node>;
  onOpenNode: (nodeId: string) => void;
  sortedInboxNodes: SortedInboxNodeItem[];
  sortedInboxRuns: SortedInboxRunItem[];
}) {
  return (
    <SectionBlock count={props.sortedInboxNodes.length + props.sortedInboxRuns.length} title="Inbox">
      {props.sortedInboxNodes.map(({ entry }) => (
        <InboxImportedNodeRow entry={entry} key={`linked-${entry.importId}`} nodesById={props.nodesById} onOpenNode={props.onOpenNode} />
      ))}
      {props.sortedInboxRuns.map(({ entry }) => (
        <InboxRecentRunRow entry={entry} key={`run-${entry.importId}`} nodesById={props.nodesById} onOpenNode={props.onOpenNode} />
      ))}
    </SectionBlock>
  );
}

function LibraryOverviewSection(props: {
  booksInventory: RuntimeReadwiseBooksInventory | null;
  handleOpenBookNode: (nodeId: string) => void;
  handleReimportBook: (input: { nodeId: string; title: string }) => Promise<void>;
  nodesById: Record<string, Node>;
  resettingNodeId: string | null;
  sortedBooks: SortedBookItem[];
  sortedPdfItems: SortedPdfItem[];
}) {
  return (
    <>
      <SectionBlock count={props.sortedBooks.length} title="Readwise Books">
        {props.sortedBooks.map(({ book }) => (
          <ReadwiseBookInventoryItem
            book={book}
            key={book.bookKey}
            nodesById={props.nodesById}
            onOpenBookNode={props.handleOpenBookNode}
            onResetBookImport={props.handleReimportBook}
            resettingNodeId={props.resettingNodeId}
            scannedAt={formatDateLabel(props.booksInventory?.scannedAt ?? '')}
          />
        ))}
      </SectionBlock>
      <SectionBlock count={props.sortedPdfItems.length} title="PDF">
        {props.sortedPdfItems.map(({ item }) => (
          <PdfInventoryItem
            importedAt={formatDateLabel(item.lastImportedAt)}
            item={item}
            key={item.sourceFingerprint}
            nodesById={props.nodesById}
          />
        ))}
      </SectionBlock>
    </>
  );
}

export function ImportOverviewContent(props: {
  booksInventory: RuntimeReadwiseBooksInventory | null;
  handleOpenBookNode: (nodeId: string) => void;
  handleReimportBook: (input: { nodeId: string; title: string }) => Promise<void>;
  nodesById: Record<string, Node>;
  onOpenNode: (nodeId: string) => void;
  resettingNodeId: string | null;
  sortedBooks: SortedBookItem[];
  sortedInboxNodes: SortedInboxNodeItem[];
  sortedInboxRuns: SortedInboxRunItem[];
  sortedPdfItems: SortedPdfItem[];
}) {
  return (
    <div className="pt-5">
      <InboxOverviewSection
        nodesById={props.nodesById}
        onOpenNode={props.onOpenNode}
        sortedInboxNodes={props.sortedInboxNodes}
        sortedInboxRuns={props.sortedInboxRuns}
      />
      <LibraryOverviewSection
        booksInventory={props.booksInventory}
        handleOpenBookNode={props.handleOpenBookNode}
        handleReimportBook={props.handleReimportBook}
        nodesById={props.nodesById}
        resettingNodeId={props.resettingNodeId}
        sortedBooks={props.sortedBooks}
        sortedPdfItems={props.sortedPdfItems}
      />
    </div>
  );
}
