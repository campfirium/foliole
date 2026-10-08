export function buildNodeBodyContentSql(nodeAlias = 'n') {
  return `${nodeAlias}.content`;
}
