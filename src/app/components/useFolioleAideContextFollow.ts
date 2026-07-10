import { useState } from 'react';

import {
  getFolioleAideFollowCurrentMaterial,
  setFolioleAideFollowCurrentMaterial
} from '../../shared/platform/folioleAideSettings';

export function useFolioleAideContextFollow() {
  const [enabled, setEnabled] = useState(getFolioleAideFollowCurrentMaterial);
  return [enabled, (next: boolean) => {
    setFolioleAideFollowCurrentMaterial(next);
    setEnabled(next);
  }] as const;
}
