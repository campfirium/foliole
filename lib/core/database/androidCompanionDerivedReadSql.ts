import { ANDROID_COMPANION_RESOURCE_STATUSES as RESOURCE_STATUS } from './androidCompanionSyncProtocolDefinitions.js';

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

const UNTITLED_TITLE = 'Untitled';
const PDF_PLACEHOLDER_TEXT = 'Linked PDF source ready for the reader surface.';
const PDF_TEXT_SEPARATOR = "char(10) || char(10)";
const READABLE_ARTICLE_TITLE_EXPRESSION = `COALESCE(NULLIF(TRIM(n.title), ''), ${androidSqlString(UNTITLED_TITLE)})`;
const READABLE_ARTICLE_INLINE_CONTENT = 'n.content';
const READABLE_ARTICLE_BODY_BLOB_DATA = 'CAST(cbd.data AS TEXT)';
const READABLE_ARTICLE_CONTENT = androidResolvedContentExpression(
  READABLE_ARTICLE_INLINE_CONTENT,
  READABLE_ARTICLE_BODY_BLOB_DATA
);
const READABLE_ARTICLE_PDF_ATTACHMENT_ID = androidReadableArticleReferencePdfAttachmentSql();
const READABLE_ARTICLE_PDF_TEXT = androidReadableArticlePdfTextSql(READABLE_ARTICLE_PDF_ATTACHMENT_ID);
const READABLE_ARTICLE_STATUS = androidBodyStatusExpression({
  availabilityExpression: 'cb.availability',
  bodyBlobDataExpression: READABLE_ARTICLE_BODY_BLOB_DATA,
  bodyBlobHashExpression: 'n.body_blob_hash',
  contentExpression: READABLE_ARTICLE_CONTENT,
  emptyWhenBlank: true
});

export function androidReadableArticleSql(whereClause: string) {
  return (
    'SELECT n.id, ' +
    `${READABLE_ARTICLE_TITLE_EXPRESSION} AS title, n.body_blob_hash, ` +
    `${readableArticleContentSql()} AS content, ${READABLE_ARTICLE_STATUS} AS content_status, ` +
    `(${READABLE_ARTICLE_PDF_ATTACHMENT_ID}) AS pdf_attachment_id ` +
    'FROM nodes n LEFT JOIN content_blobs cb ON cb.hash = n.body_blob_hash ' +
    'LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash ' +
    whereClause
  );
}

export function androidReadableArticleColumns() {
  return [
    { key: 'id', source: 'id', type: 'string' },
    { key: 'title', source: 'title', type: 'string' },
    { key: 'content', source: 'content', type: 'nullableString' },
    { key: 'body_blob_hash', source: 'body_blob_hash', type: 'nullableString' },
    { key: 'content_status', source: 'content_status', type: 'string' },
    { key: 'pdf_attachment_id', source: 'pdf_attachment_id', type: 'nullableString' }
  ];
}

export function androidReadableArticleReferencePdfAttachmentSql(nodeIdExpression = 'n.id') {
  return (
    'SELECT na.attachment_id FROM node_attachments na ' +
    "INNER JOIN attachments a ON a.id = na.attachment_id AND a.mime_type = 'application/pdf' " +
    `WHERE na.node_id = ${nodeIdExpression} AND na.role = 'reference' ORDER BY na.attachment_id ASC LIMIT 1`
  );
}

function readableArticleContentSql() {
  return (
    `CASE WHEN instr(COALESCE(${READABLE_ARTICLE_CONTENT}, ''), ${androidSqlString(PDF_PLACEHOLDER_TEXT)}) > 0 ` +
    `AND (${READABLE_ARTICLE_PDF_TEXT}) IS NOT NULL ` +
    `THEN '# ' || ${READABLE_ARTICLE_TITLE_EXPRESSION} || ${PDF_TEXT_SEPARATOR} || (${READABLE_ARTICLE_PDF_TEXT}) ` +
    `ELSE ${READABLE_ARTICLE_CONTENT} END`
  );
}

function androidReadableArticlePdfTextSql(attachmentIdSql: string) {
  return (
    'SELECT group_concat(page_text.text, char(10) || char(10)) FROM (' +
    'SELECT TRIM(ppt.text) AS text FROM pdf_page_text ppt ' +
    `WHERE ppt.attachment_id = (${attachmentIdSql}) AND TRIM(ppt.text) <> '' ORDER BY ppt.page ASC` +
    ') page_text'
  );
}
