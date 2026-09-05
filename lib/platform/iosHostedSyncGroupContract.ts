export const IOS_HOSTED_SYNC_GROUP_ID = 'group-t152-ios-runtime';
export const IOS_HOSTED_PROVIDER_DEVICE_ID = JSON.stringify([
  1,
  IOS_HOSTED_SYNC_GROUP_ID,
  'a1111111-1111-4111-8111-111111111111',
  '/acceptance/provider/foliole.db'
]);
export const IOS_HOSTED_PROVIDER_NAME = 'Acceptance Provider';

export const IOS_HOSTED_DISCOVERY_TXT_KEYS = Object.freeze({
  deviceId: 'device_id',
  groupId: 'group_id',
  groupTag: 'group_tag',
  runtimeInstanceId: 'runtime_instance_id'
});
