import { ImportSourceWorkspaceDetails } from './ImportSourceWorkspaceDetails';

type ImportSourceWorkspaceProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectNode?: (nodeId: string) => void;
};

export function ImportSourceWorkspace({ open, onOpenChange, onSelectNode }: ImportSourceWorkspaceProps) {
  if (!open) {
    return null;
  }
  return <ImportSourceWorkspaceDetails onOpenChange={onOpenChange} {...(onSelectNode ? { onSelectNode } : {})} open={open} />;
}
