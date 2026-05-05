import { Flex } from '@radix-ui/themes';

import { IconButton } from '../../shared/ui';

interface WorkspaceToolbarProps {
  canGoBack: boolean;
  canGoForward: boolean;
  canGoParent: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onGoParent: () => void;
}

export function WorkspaceToolbar({
  canGoBack,
  canGoForward,
  canGoParent,
  onGoBack,
  onGoForward,
  onGoParent
}: WorkspaceToolbarProps) {
  return (
    <section
      aria-label="Workspace toolbar"
      className="flex min-h-[40px] flex-none items-center border-b border-amber-900/15 bg-gradient-to-r from-[#f7f1e6] to-[#f1e7d6] px-3"
    >
      <Flex gap="1">
        <IconButton
          className="size-7 rounded-md border border-transparent text-stone-600 hover:border-amber-900/20 hover:bg-amber-100/60 hover:text-stone-900"
          disabled={!canGoBack}
          icon="←"
          label="Go back"
          onClick={onGoBack}
        />
        <IconButton
          className="size-7 rounded-md border border-transparent text-stone-600 hover:border-amber-900/20 hover:bg-amber-100/60 hover:text-stone-900"
          disabled={!canGoForward}
          icon="→"
          label="Go forward"
          onClick={onGoForward}
        />
        <IconButton
          className="size-7 rounded-md border border-transparent text-stone-600 hover:border-amber-900/20 hover:bg-amber-100/60 hover:text-stone-900"
          disabled={!canGoParent}
          icon="↑"
          label="Go to parent node"
          onClick={onGoParent}
        />
      </Flex>
    </section>
  );
}
