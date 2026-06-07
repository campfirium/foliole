import { Suspense, lazy } from 'react';

const ImportSourceWorkspaceDetails = lazy(() =>
  import('./ImportSourceWorkspaceDetails').then((module) => ({ default: module.ImportSourceWorkspaceDetails }))
);

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
