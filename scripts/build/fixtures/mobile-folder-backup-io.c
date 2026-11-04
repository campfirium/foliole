/* Diagnostic VFS: delegate all real I/O, count target writes and inject one
 * failing pager write or process death. It is never built into the App. */
#include "mobile-folder-backup-io.h"
#include "sqlite3.h"
#include <stdatomic.h>
#include <stdlib.h>
#include <unistd.h>

typedef struct ObservedMethods {
    sqlite3_io_methods methods;
    const sqlite3_io_methods *inner;
    int main;
} ObservedMethods;

static sqlite3_vfs observer;
static sqlite3_vfs *underlying;
static atomic_int faultMode, attempts;
static atomic_ullong mainBytes, journalBytes;
static void (*firstWrite)(void *);
static void *writeContext;

static int observedWrite(sqlite3_file *file, const void *bytes, int size, sqlite3_int64 offset) {
    ObservedMethods *methods = (ObservedMethods *)file->pMethods;
    int fault = atomic_load(&faultMode);
    if (methods->main) {
        int attempt = atomic_fetch_add(&attempts, 1);
        if (!attempt && firstWrite) firstWrite(writeContext);
        if (attempt == 1 && (fault == 1 || fault == 2)) {
            atomic_store(&faultMode, 0);
            return fault == 1 ? SQLITE_IOERR_WRITE : SQLITE_FULL;
        }
    }
    int rc = methods->inner->xWrite(file, bytes, size, offset);
    if (rc == SQLITE_OK) {
        if (methods->main) atomic_fetch_add(&mainBytes, size);
        else atomic_fetch_add(&journalBytes, size);
        if (methods->main && fault == 86) {
            if (methods->inner->xSync(file, SQLITE_SYNC_FULL) == SQLITE_OK) _exit(86);
        }
    }
    return rc;
}

static int observedClose(sqlite3_file *file) {
    ObservedMethods *methods = (ObservedMethods *)file->pMethods;
    file->pMethods = methods->inner;
    int rc = methods->inner->xClose(file);
    free(methods);
    return rc;
}

static int observedOpen(sqlite3_vfs *vfs, const char *name, sqlite3_file *file,
                        int flags, int *outputFlags) {
    (void)vfs;
    int rc = underlying->xOpen(underlying, name, file, flags, outputFlags);
    if (rc != SQLITE_OK) return rc;
    ObservedMethods *methods = calloc(1, sizeof(*methods));
    if (!methods) {
        file->pMethods->xClose(file);
        return SQLITE_NOMEM;
    }
    methods->inner = file->pMethods;
    methods->methods = *file->pMethods;
    methods->main = (flags & SQLITE_OPEN_MAIN_DB) != 0;
    methods->methods.xWrite = observedWrite;
    methods->methods.xClose = observedClose;
    file->pMethods = &methods->methods;
    return SQLITE_OK;
}

char *fixture_io_uri(const char *path) {
    if (!underlying) {
        underlying = sqlite3_vfs_find(NULL);
        observer = *underlying;
        observer.zName = "foliole-native-backup-io-fixture";
        observer.xOpen = observedOpen;
        sqlite3_vfs_register(&observer, 0);
    }
    return sqlite3_mprintf("file:%s?vfs=%s", path, observer.zName);
}

void fixture_io_reset(int fault, void (*beforeWrite)(void *), void *context) {
    atomic_store(&faultMode, fault);
    atomic_store(&attempts, 0);
    atomic_store(&mainBytes, 0);
    atomic_store(&journalBytes, 0);
    firstWrite = beforeWrite;
    writeContext = context;
}

uint64_t fixture_io_main_bytes(void) { return atomic_load(&mainBytes); }
uint64_t fixture_io_journal_bytes(void) { return atomic_load(&journalBytes); }
