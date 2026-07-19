export function createOptionalNodeMenuHandler(
  nodeId: string | null,
  onOpen: ((nodeId: string) => void) | undefined,
  onClose: () => void
) {
  return () => {
    if (nodeId && onOpen) {
      onOpen(nodeId);
    }
    onClose();
  };
}
