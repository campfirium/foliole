import { useState } from 'react';

export function useVirtualNodeView() {
  const [isVirtualViewOpen, setIsVirtualViewOpen] = useState(false);

  const openVirtualView = () => {
    setIsVirtualViewOpen(true);
  };

  const closeVirtualView = () => {
    setIsVirtualViewOpen(false);
  };

  return {
    closeVirtualView,
    isVirtualViewOpen,
    openVirtualView
  };
}
