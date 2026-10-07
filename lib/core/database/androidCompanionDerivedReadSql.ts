import { ANDROID_COMPANION_RESOURCE_STATUSES as RESOURCE_STATUS } from './androidCompanionSyncProtocolDefinitions.js';
import { NODE_RESOURCES_SQL } from './nodeResourcesSql.js';

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
export function androidReadableArticleSql(whereClause: string, body?: Readonly<{
  dataExpression: string;
  contentExpression: string;
  join: string;
}>) {
  const data = body?.dataExpression ?? READABLE_ARTICLE_BODY_BLOB_DATA;
  const content = body?.contentExpression ?? READABLE_ARTICLE_CONTENT;
  const status = androidBodyStatusExpression({ availabilityExpression: 'cb.availability',
    bodyBlobDataExpression: data, bodyBlobHashExpression: 'n.body_blob_hash',
    contentExpression: content, emptyWhenBlank: true });
  return (
    'SELECT n.id, ' +
    `${READABLE_ARTICLE_TITLE_EXPRESSION} AS title, n.body_blob_hash, n.reveal, ` +
    `${readableArticleContentSql(content)} AS content, ${status} AS content_status, ` +
    `(${READABLE_ARTICLE_PDF_ATTACHMENT_ID}) AS pdf_attachment_id ` +
    'FROM nodes n LEFT JOIN content_blobs cb ON cb.hash = n.body_blob_hash ' +
    (body?.join ?? 'LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash ') +
    whereClause
  );
}

export function androidReadableArticleColumns() {
  return [
    { key: 'id', source: 'id', type: 'string' },
    { key: 'title', source: 'title', type: 'string' },
    { key: 'content', source: 'content', type: 'nullableString' },
    { key: 'body_blob_hash', source: 'body_blob_hash', type: 'nullableString' },
    { key: 'reveal', source: 'reveal', type: 'nullableString' },
    { key: 'content_status', source: 'content_status', type: 'string' },
    { key: 'pdf_attachment_id', source: 'pdf_attachment_id', type: 'nullableString' }
  ];
}

export function androidReadableArticleReferencePdfAttachmentSql(nodeIdExpression = 'n.id') {
  return `SELECT attachment_id FROM (${NODE_RESOURCES_SQL}) resource
    WHERE resource.node_id = ${nodeIdExpression} AND role = 'reference'
      AND mime_type = 'application/pdf' ORDER BY attachment_id LIMIT 1`;
}

function readableArticleContentSql(content: string) {
  return (
    `CASE WHEN instr(COALESCE(${content}, ''), ${androidSqlString(PDF_PLACEHOLDER_TEXT)}) > 0 ` +
    `AND (${READABLE_ARTICLE_PDF_TEXT}) IS NOT NULL ` +
    `THEN '# ' || ${READABLE_ARTICLE_TITLE_EXPRESSION} || ${PDF_TEXT_SEPARATOR} || (${READABLE_ARTICLE_PDF_TEXT}) ` +
    `ELSE ${content} END`
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
