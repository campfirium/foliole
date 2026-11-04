#include "FolioleFolderBackupAndroid.h"
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <string.h>
#include <sys/stat.h>

/* The backup target has one connection. A conservative whole-file exclusive
 * lock also conflicts with standard SQLite byte-range locks in other processes.
 * It never locks the source database. No WAL/shared-memory target is supported. */

static int ioClose(sqlite3_file *file) {
  return close(((FolioleSafFile *)file)->fd) ? SQLITE_IOERR_CLOSE : SQLITE_OK;
}

static int ioRead(sqlite3_file *file, void *data, int length, sqlite3_int64 offset) {
  FolioleSafFile *saf = (FolioleSafFile *)file;
  int done = 0;
  while (done < length) {
    ssize_t count = pread(saf->fd, (char *)data + done, length - done, offset + done);
    if (count < 0 && errno == EINTR) continue;
    if (count < 0) return SQLITE_IOERR_READ;
    if (!count) {
      memset((char *)data + done, 0, length - done);
      return SQLITE_IOERR_SHORT_READ;
    }
    done += count;
  }
  return SQLITE_OK;
}

static int ioWrite(sqlite3_file *file, const void *data, int length, sqlite3_int64 offset) {
  FolioleSafFile *saf = (FolioleSafFile *)file;
  int done = 0;
  while (done < length) {
    ssize_t count = pwrite(saf->fd, (const char *)data + done, length - done, offset + done);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) return SQLITE_IOERR_WRITE;
    done += count;
  }
  return SQLITE_OK;
}

static int ioTruncate(sqlite3_file *file, sqlite3_int64 size) {
  return ftruncate(((FolioleSafFile *)file)->fd, size) ? SQLITE_IOERR_TRUNCATE : SQLITE_OK;
}

static int ioSync(sqlite3_file *file, int flags) {
  (void)flags;
  FolioleSafFile *saf = (FolioleSafFile *)file;
  if (fsync(saf->fd)) return SQLITE_IOERR_FSYNC;
  return SQLITE_OK;
}

static int ioSize(sqlite3_file *file, sqlite3_int64 *size) {
  struct stat info;
  if (fstat(((FolioleSafFile *)file)->fd, &info)) return SQLITE_IOERR_FSTAT;
  *size = info.st_size;
  return SQLITE_OK;
}

static int ioLock(sqlite3_file *file, int lock) {
  FolioleSafFile *saf = (FolioleSafFile *)file;
  if (saf->lock >= lock) return SQLITE_OK;
  struct flock record = { .l_type = F_WRLCK, .l_whence = SEEK_SET };
  if (fcntl(saf->fd, F_SETLK, &record)) return SQLITE_BUSY;
  saf->lock = lock;
  return SQLITE_OK;
}

static int ioUnlock(sqlite3_file *file, int lock) {
  FolioleSafFile *saf = (FolioleSafFile *)file;
  if (lock == SQLITE_LOCK_NONE) {
    struct flock record = { .l_type = F_UNLCK, .l_whence = SEEK_SET };
    if (fcntl(saf->fd, F_SETLK, &record)) return SQLITE_IOERR_UNLOCK;
  }
  saf->lock = lock;
  return SQLITE_OK;
}

static int ioReserved(sqlite3_file *file, int *reserved) {
  FolioleSafFile *saf = (FolioleSafFile *)file;
  struct flock record = { .l_type = F_WRLCK, .l_whence = SEEK_SET };
  if (fcntl(saf->fd, F_GETLK, &record)) return SQLITE_IOERR_CHECKRESERVEDLOCK;
  *reserved = saf->lock >= SQLITE_LOCK_RESERVED || record.l_type != F_UNLCK;
  return SQLITE_OK;
}

static int ioControl(sqlite3_file *file, int operation, void *argument) {
  if (operation == SQLITE_FCNTL_LOCKSTATE) {
    *(int *)argument = ((FolioleSafFile *)file)->lock;
    return SQLITE_OK;
  }
  return SQLITE_NOTFOUND;
}

static int ioSector(sqlite3_file *file) { (void)file; return 4096; }
static int ioCharacteristics(sqlite3_file *file) { (void)file; return 0; }

const sqlite3_io_methods foliole_saf_io = {
  .iVersion = 1, .xClose = ioClose, .xRead = ioRead, .xWrite = ioWrite,
  .xTruncate = ioTruncate, .xSync = ioSync, .xFileSize = ioSize,
  .xLock = ioLock, .xUnlock = ioUnlock, .xCheckReservedLock = ioReserved,
  .xFileControl = ioControl, .xSectorSize = ioSector, .xDeviceCharacteristics = ioCharacteristics
};
