import { ImportSourceWorkspaceDetails } from './ImportSourceWorkspaceDetails';

type ImportSourceWorkspaceProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ImportSourceWorkspace({ open, onOpenChange }: ImportSourceWorkspaceProps) {
  return <ImportSourceWorkspaceDetails onOpenChange={onOpenChange} open={open} />;
}
