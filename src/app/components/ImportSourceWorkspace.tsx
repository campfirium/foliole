import { Suspense, lazy } from 'react';

function loadImportSourceWorkspaceDetails() {
  return import('./ImportSourceWorkspaceDetails');
}

const ImportSourceWorkspaceDetails = lazy(() =>
  loadImportSourceWorkspaceDetails().then((module) => ({ default: module.ImportSourceWorkspaceDetails }))
);

let importSourceWorkspacePrewarm: Promise<void> | null = null;

export function prewarmImportSourceWorkspace() {
  importSourceWorkspacePrewarm ??= loadImportSourceWorkspaceDetails().then(() => undefined).catch(() => undefined);
  return importSourceWorkspacePrewarm;
}

type ImportSourceWorkspaceProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectNode?: (nodeId: string) => void;
};

export function ImportSourceWorkspace({ open, onOpenChange, onSelectNode }: ImportSourceWorkspaceProps) {
  if (!open) {
    return null;
  }
  return (
    <Suspense fallback={null}>
      <ImportSourceWorkspaceDetails onOpenChange={onOpenChange} {...(onSelectNode ? { onSelectNode } : {})} open={open} />
    </Suspense>
  );
}
