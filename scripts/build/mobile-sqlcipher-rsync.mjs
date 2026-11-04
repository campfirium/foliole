import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Keep the upstream hash exchange and pager transactions. Remove the CLI and
// process-launching code, then bind each endpoint to its native job lifetime.
export function prepareNativeRsync(core) {
  let source = readFileSync(path.join(core.source, 'tool/sqlite3_rsync.c'), 'utf8');
  const popen = source.lastIndexOf('/*', source.indexOf('** Beginning of the popen2()'));
  const hash = source.lastIndexOf('/*', source.indexOf('** The Hash Engine'));
  const cli = source.indexOf('static int numVs(');
  if (popen < 0 || hash < popen || cli < hash) throw new Error('Unexpected upstream rsync sections');
  source = source.slice(0, popen) + source.slice(hash, cli);
  const replace = (original, replacement) => {
    if (source.split(original).length !== 2) throw new Error(`Unexpected upstream rsync seam: ${original}`);
    source = source.replace(original, replacement);
  };
  replace('struct SQLiteRsync {', 'struct SQLiteRsync {\n  FolioleBackupJob *job;');
  replace('sqlite3_open_v2(p->zOrigin, &p->db, SQLITE_OPEN_READWRITE, 0)',
    'folioleRsyncOpenSource(p)');
  replace('hashRegister(p->db);\n    runSql(p, "BEGIN");',
    'folioleRsyncOpened(p);\n    hashRegister(p->db);\n    runSql(p, "BEGIN");');
  replace('sqlite3_db_config(p->db, SQLITE_DBCONFIG_WRITABLE_SCHEMA, 1, 0);',
    'folioleRsyncOpened(p);\n        sqlite3_db_config(p->db, SQLITE_DBCONFIG_WRITABLE_SCHEMA, 1, 0);');
  replace('runSqlReturnUInt(p, &nPage, "PRAGMA page_count");',
    'runSqlReturnUInt(p, &nPage, "PRAGMA page_count");\n'
    + '    if( nPage==0 ){ reportError(p, "Source database is not initialized"); closeDb(p); return; }\n'
    + '    folioleRsyncPinned(p);');
  replace('runSql(p, "BEGIN IMMEDIATE");',
    'folioleRsyncTargetStarting(p, nRPage);\n'
    + '        runSql(p, "PRAGMA replica.journal_mode=PERSIST");\n'
    + '        runSql(p, "PRAGMA replica.synchronous=FULL");\n'
    + '        runSql(p, "BEGIN IMMEDIATE");');
  replace('        if( p->iProtocol<2 || nRPage<=100 ){',
    '        folioleRsyncValidate(p);\n        if( p->nErr ) break;\n'
    + '        if( p->iProtocol<2 || nRPage<=100 ){');
  replace('if( pgno==1 &&  eJMode==2 && buf[18]==1 ){',
    'if( pgno==1 && eJMode==1 ) buf[18] = buf[19] = 1;\n'
    + '        if( pgno==1 &&  eJMode==2 && buf[18]==1 ){');
  replace('        break;\n      }\n      case ORIGIN_PAGE:',
    '        if( p->nErr==0 ){\n'
    + '          folioleRsyncCommitted(p);\n'
    + '          runSqlReturnText(p, buf, "PRAGMA replica.journal_mode=DELETE");\n'
    + '          if( p->nErr==0 && strcmp(buf,"delete")==0 ) folioleRsyncCleaned(p);\n'
    + '          else if( p->nErr==0 ) reportError(p, "Journal cleanup is incomplete");\n'
    + '        }\n'
    + '        break;\n      }\n      case ORIGIN_PAGE:');
  for (const end of ['REPLICA_END', 'ORIGIN_END']) {
    replace(`while( p->nErr<=p->nWrErr && (c = readByte(p))!=EOF && c!=${end} ){`,
      `while( !foliole_backup_should_stop(p->job) && p->nErr<=p->nWrErr && (c = readByte(p))!=EOF && c!=${end} ){`);
  }
  replace('static void closeDb(SQLiteRsync *p){\n  if( p->db ){',
    'static void closeDb(SQLiteRsync *p){\n  if( p->db ){\n    folioleRsyncClosing(p);');
  replace('          sqlite3_finalize(pStmt);\n          writeByte(p, ORIGIN_TXN);',
    '          sqlite3_finalize(pStmt);\n          folioleRsyncTransferred(p);\n'
    + '          writeByte(p, ORIGIN_TXN);');
  replace('  logError(p, "%s\\n", zMsg);',
    '  folioleRsyncError(p, zMsg);\n  logError(p, "%s\\n", zMsg);');
  const output = path.join(core.build, 'foliole_sqlite_rsync.inc');
  writeFileSync(output, source);
  return output;
}
