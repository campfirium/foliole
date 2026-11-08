import { createContext } from 'react';

import type { WorkspaceLayoutReviewProps } from './workspaceLayoutPropGroups';

export const DiveFlowActionContext = createContext<WorkspaceLayoutReviewProps['onOpenDiveFlow']>(undefined);
