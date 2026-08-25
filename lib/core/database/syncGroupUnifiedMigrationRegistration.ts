import {
  UNIFIED_COMPANION_SCHEMA_VERSION,
  UNIFIED_DESKTOP_SCHEMA_VERSION
} from '../../platform/syncGroupUnifiedContract.js';

export const UNREGISTERED_UNIFIED_SCHEMA_MIGRATIONS = {
  companion: {
    from_version: UNIFIED_COMPANION_SCHEMA_VERSION - 1,
    registered: false,
    target_version: UNIFIED_COMPANION_SCHEMA_VERSION
  },
  desktop: {
    from_version: UNIFIED_DESKTOP_SCHEMA_VERSION - 1,
    registered: false,
    target_version: UNIFIED_DESKTOP_SCHEMA_VERSION
  }
} as const;
