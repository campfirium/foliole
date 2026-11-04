#ifndef FOLIOLE_FOLDER_BACKUP_H
#define FOLIOLE_FOLDER_BACKUP_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct FolioleBackupJob FolioleBackupJob;

typedef struct FolioleBackupOptions {
    unsigned int timeoutMilliseconds;
    void (*snapshotStarted)(void *context);
    void *context;
    void (*transactionCommitted)(void *context);
    const char *expectedFingerprint;
    const char *pendingFingerprint;
    int (*snapshotPrepared)(void *context, const char *fingerprint);
    void (*sourceReleased)(void *context);
} FolioleBackupOptions;

typedef struct FolioleBackupResult {
    int code;
    int committed;
    int cleanupPending;
    unsigned int sourcePages;
    unsigned int pagesSent;
    char message[256];
    char fingerprint[41];
} FolioleBackupResult;

/* Trusted native callers provide the current owner's source and authorized target.
 * The target may be a URI selecting a registered directory VFS. No source writes,
 * subprocesses, network endpoints or persistent protocol messages are used.
 * Run on a background worker; cancel may be called concurrently. Keep callback
 * context alive until run returns. sourceReleased means the source snapshot is
 * closed and will not reopen, even if target I/O is still completing. The
 * snapshotPrepared callback must durably retain the pending fingerprint before
 * returning success. Expected/pending fingerprints are copied by create.
 * Destroy only after the worker has returned. */
FolioleBackupJob *foliole_backup_create(const char *source, const char *target,
                                      const FolioleBackupOptions *options);
int foliole_backup_run(FolioleBackupJob *job, FolioleBackupResult *result);
void foliole_backup_cancel(FolioleBackupJob *job);
int foliole_backup_destroy(FolioleBackupJob *job);
uintptr_t foliole_backup_engine_address(void);

#ifdef __cplusplus
}
#endif

#endif
