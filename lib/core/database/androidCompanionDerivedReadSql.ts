import { ANDROID_COMPANION_RESOURCE_STATUSES as RESOURCE_STATUS } from './androidCompanionSyncProtocolDefinitions.ts';

export function androidSqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

export function androidResolvedContentExpression(inlineExpression: string, bodyBlobDataExpression: string) {
  return `COALESCE(${bodyBlobDataExpression}, ${inlineExpression})`;
}

export function androidBodyStatusExpression(args: {
  availabilityExpression: string;
  bodyBlobDataExpression: string;
  bodyBlobHashExpression: string;
  contentExpression: string;
  emptyWhenBlank: boolean;
}) {
  const passthroughStatuses = RESOURCE_STATUS.passthroughAvailabilityStatuses.map(androidSqlString).join(', ');
  const missingStatus = androidSqlString(RESOURCE_STATUS.missing);
  const emptyStatus = androidSqlString(RESOURCE_STATUS.empty);
  const readyStatus = androidSqlString(RESOURCE_STATUS.ready);
  const blobMissingStatus =
    `WHEN ${args.bodyBlobHashExpression} IS NOT NULL AND TRIM(${args.bodyBlobHashExpression}) <> '' ` +
    `AND ${args.bodyBlobDataExpression} IS NULL THEN CASE WHEN ${args.availabilityExpression} IN (${passthroughStatuses}) ` +
    `THEN ${args.availabilityExpression} ELSE ${missingStatus} END`;
  const emptyStatusBranch = args.emptyWhenBlank
    ? ` WHEN TRIM(COALESCE(${args.contentExpression}, '')) = '' THEN ${emptyStatus}`
    : '';
  return `CASE ${blobMissingStatus}${emptyStatusBranch} ELSE ${readyStatus} END`;
}

export function androidSearchExcerptExpression(textExpression: string, queryPlaceholder: string, radius: number) {
  const matchStart = `instr(lower(${textExpression}), ${queryPlaceholder})`;
  return `trim(substr(${textExpression}, max(1, ${matchStart} - ${radius}), ${radius * 2}))`;
}
