import { useWorkspaceStore } from '../../store/workspaceStore';

export function useWorkspaceHydration() {
  return useWorkspaceStore((state) => state.isHydrated);
}
