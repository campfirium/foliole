import { useState } from 'react';

import { useSavedSidebarTiers, useSidebarLayoutWindowPercent } from '../../features/settings/model/sidebarLayoutPreference';
import { selectSidebarTier, type SidebarMode, type SidebarSide, type SidebarTier } from '../../features/settings/model/sidebarLayoutTiers';

type Overrides = Partial<Record<SidebarSide, SidebarMode>>;

function firstSidebarToFloat(tiers: readonly SidebarTier[], active: SidebarTier): SidebarSide {
  const activeThreshold = active.threshold ?? -1;
  let nearestThreshold = -2;
  let first: SidebarSide = 'left';
  for (const tier of tiers) {
    const threshold = tier.threshold ?? -1;
    if (threshold >= activeThreshold || threshold <= nearestThreshold) continue;
    const leftDocked = tier.left.mode === 'dock';
    const rightDocked = tier.right.mode === 'dock';
    if (leftDocked === rightDocked) continue;
    nearestThreshold = threshold;
    first = leftDocked ? 'right' : 'left';
  }
  return first;
}

export function useActiveSidebarTier() {
  const tiers = useSavedSidebarTiers();
  const percent = useSidebarLayoutWindowPercent();
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
    tier, left, right, percent,
    pdfFirstSidebar: tiers && tier ? firstSidebarToFloat(tiers, tier) : 'right',
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
