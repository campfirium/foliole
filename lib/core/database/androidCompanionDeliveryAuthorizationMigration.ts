export const ANDROID_COMPANION_DELIVERY_AUTHORIZATION_ACTION_TYPES = {
  migrateDeliveryAuthorizations: 'migrateDeliveryAuthorizations'
} as const;

export const ANDROID_COMPANION_DELIVERY_AUTHORIZATION_PLAN_STEP = {
  actions: [{
    errorMessage: 'Failed to cut over delivery receipt authorizations.',
    type: 'migrateDeliveryAuthorizations'
  }],
  beforeVersion: 31
} as const;
