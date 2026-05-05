export function getNodeListScrollContainerClassName(isVirtualViewOpen: boolean) {
  return isVirtualViewOpen
    ? 'app-scrollbar flex h-full min-h-0 flex-col overflow-y-auto overflow-x-hidden px-4 pb-2 pt-5'
    : 'app-scrollbar flex h-full min-h-0 flex-col overflow-y-auto overflow-x-hidden px-4 py-2';
}
