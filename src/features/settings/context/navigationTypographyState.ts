import { useState } from 'react';

import { getNodeListRowSpacing, setNodeListRowSpacing, DEFAULT_NODE_LIST_ROW_SPACING } from '../../nodes/components/nodeListRowSpacingSettings';

export function useNavigationTypographyState() {
  const [nodeListRowSpacingState, setNodeListRowSpacingState] = useState(getNodeListRowSpacing);

  return {
    nodeListRowSpacingState,
    resetNodeListRowSpacing: () => (setNodeListRowSpacing(DEFAULT_NODE_LIST_ROW_SPACING), setNodeListRowSpacingState(DEFAULT_NODE_LIST_ROW_SPACING)),
    setNodeListRowSpacing: (value: number) => (setNodeListRowSpacing(value), setNodeListRowSpacingState(getNodeListRowSpacing()))
  };
}
