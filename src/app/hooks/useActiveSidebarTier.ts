import { useState } from 'react';

import { useSavedSidebarTiers, useSidebarLayoutWindowPercent } from '../../features/settings/model/sidebarLayoutPreference';
import { selectSidebarTier, type SidebarMode, type SidebarSide } from '../../features/settings/model/sidebarLayoutTiers';

type Overrides = Partial<Record<SidebarSide, SidebarMode>>;

export function useActiveSidebarTier() {
  const tiers = useSavedSidebarTiers();
  const percent = useSidebarLayoutWindowPercent(tiers !== null);
  const tier = tiers && percent !== null ? selectSidebarTier(tiers, percent) : undefined;
  const id = tier?.id;
  const leftDefault = tier?.left.mode;
  const rightDefault = tier?.right.mode;
  const [temporary, setTemporary] = useState({ id, leftDefault, rightDefault, overrides: {} as Overrides });
  const sameTier = temporary.id === id;
  const leftOverride = sameTier && temporary.leftDefault === leftDefault ? temporary.overrides.left : undefined;
  const rightOverride = sameTier && temporary.rightDefault === rightDefault ? temporary.overrides.right : undefined;
  const setOverrides = (overrides: Overrides) => setTemporary({ id, leftDefault, rightDefault, overrides });
  if (!sameTier || temporary.leftDefault !== leftDefault || temporary.rightDefault !== rightDefault) {
    setOverrides({ ...(leftOverride && { left: leftOverride }), ...(rightOverride && { right: rightOverride }) });
  }
  const left = leftOverride ?? leftDefault;
  const right = rightOverride ?? rightDefault;

  return {
    tier, left, right,
    toggle(side: SidebarSide) {
      const mode = side === 'left' ? left : right;
      setOverrides({ ...temporary.overrides, [side]: mode === 'dock' ? 'closed' : 'dock' });
    },
    toggleBoth() {
      const mode = left === 'dock' || right === 'dock' ? 'closed' : 'dock';
      setOverrides({ left: mode, right: mode });
    }
  };
}
