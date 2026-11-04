#include "FolioleFolderBackupInternal.h"
#include <signal.h>
#include <stdlib.h>
#include <string.h>

struct SQLiteRsync;
static void folioleRsyncOpened(struct SQLiteRsync *endpoint);
static void folioleRsyncClosing(struct SQLiteRsync *endpoint);
static void folioleRsyncPinned(struct SQLiteRsync *endpoint);
static void folioleRsyncCommitted(struct SQLiteRsync *endpoint);
static void folioleRsyncCleaned(struct SQLiteRsync *endpoint);
static void folioleRsyncError(struct SQLiteRsync *endpoint, const char *message);
static void folioleRsyncTargetStarting(struct SQLiteRsync *endpoint, unsigned int pages);
static void folioleRsyncValidate(struct SQLiteRsync *endpoint);
static int folioleRsyncOpenSource(struct SQLiteRsync *endpoint);
static void folioleRsyncTransferred(struct SQLiteRsync *endpoint);
#include "foliole_sqlite_rsync.inc"
#include "FolioleFolderBackupFingerprint.inc"

static int folioleRsyncOpenSource(SQLiteRsync *endpoint) {
    if (atomic_load(&endpoint->job->sourceReleased) || atomic_load(&endpoint->job->cancelled)) {
        return SQLITE_INTERRUPT;
    }
    return sqlite3_open_v2(endpoint->zOrigin, &endpoint->db, SQLITE_OPEN_READONLY, NULL);
}

static int progress(void *context) {
    SQLiteRsync *endpoint = context;
    return foliole_backup_should_stop(endpoint->job);
}

static void folioleRsyncOpened(SQLiteRsync *endpoint) {
    FolioleBackupJob *job = endpoint->job;
    pthread_mutex_lock(&job->mutex);
    job->connections[endpoint->isReplica ? 1 : 0] = endpoint->db;
    pthread_mutex_unlock(&job->mutex);
    sqlite3_busy_timeout(endpoint->db, 0);
    sqlite3_progress_handler(endpoint->db, 1000, progress, endpoint);
}

static void folioleRsyncClosing(SQLiteRsync *endpoint) {
    FolioleBackupJob *job = endpoint->job;
    pthread_mutex_lock(&job->mutex);
    job->connections[endpoint->isReplica ? 1 : 0] = NULL;
    pthread_mutex_unlock(&job->mutex);
    sqlite3_progress_handler(endpoint->db, 0, NULL, NULL);
}

static void folioleRsyncPinned(SQLiteRsync *endpoint) {
    FolioleBackupJob *job = endpoint->job;
    if (endpoint->nErr) return;
    if (fingerprint(endpoint->db, "main", job->fingerprint) != SQLITE_OK) {
        reportError(endpoint, "Cannot fingerprint the source snapshot");
        return;
    }
    if (job->options.snapshotPrepared
        && job->options.snapshotPrepared(job->options.context, job->fingerprint) != SQLITE_OK) {
        reportError(endpoint, "Cannot retain the pending snapshot identity");
        return;
    }
    if (job->options.snapshotStarted && !endpoint->nErr) {
        job->options.snapshotStarted(job->options.context);
    }
}

static void folioleRsyncTargetStarting(SQLiteRsync *endpoint, unsigned int pages) {
    endpoint->job->targetWasEmpty = pages == 0;
}

static void folioleRsyncValidate(SQLiteRsync *endpoint) {
    FolioleBackupJob *job = endpoint->job;
    if (job->targetWasEmpty && !job->options.expectedFingerprint) return;
    char observed[41];
    if (fingerprint(endpoint->db, "replica", observed) != SQLITE_OK) {
        reportError(endpoint, "Cannot verify the previous target snapshot");
        return;
    }
    const char *expected = job->options.expectedFingerprint;
    const char *pending = job->options.pendingFingerprint;
    if ((!expected || strcmp(observed, expected)) && (!pending || strcmp(observed, pending))) {
        reportError(endpoint, "Target content differs from the retained backup identity");
    }
}

static void folioleRsyncCommitted(SQLiteRsync *endpoint) {
    atomic_store(&endpoint->job->committed, 1);
    atomic_store(&endpoint->job->cleanupPending, 1);
    sqlite3_progress_handler(endpoint->db, 0, NULL, NULL);
    if (endpoint->job->options.transactionCommitted) {
        endpoint->job->options.transactionCommitted(endpoint->job->options.context);
    }
}

static void folioleRsyncCleaned(SQLiteRsync *endpoint) {
    atomic_store(&endpoint->job->cleanupPending, 0);
}

static void folioleRsyncError(SQLiteRsync *endpoint, const char *message) {
    FolioleBackupJob *job = endpoint->job;
    pthread_mutex_lock(&job->mutex);
    if (!job->message[0] && message) snprintf(job->message, sizeof(job->message), "%s", message);
    pthread_mutex_unlock(&job->mutex);
}

static void *replicaThread(void *context) {
    SQLiteRsync *replica = context;
    replicaSide(replica);
    fclose(replica->pOut);
    fclose(replica->pIn);
    foliole_backup_transport_finish(replica->job, 1);
    return NULL;
}

static void closeStream(FILE *stream) {
    if (stream) fclose(stream);
}

static void releaseSource(FolioleBackupJob *job) {
    if (!atomic_exchange(&job->sourceReleased, 1) && job->options.sourceReleased) {
        job->options.sourceReleased(job->options.context);
    }
}

static void folioleRsyncTransferred(SQLiteRsync *endpoint) {
    closeDb(endpoint);
    releaseSource(endpoint->job);
}

static int runEndpoints(FolioleBackupJob *job, SQLiteRsync *origin, SQLiteRsync *replica) {
    int rc = foliole_backup_transport_open(job, &origin->pIn, &origin->pOut,
                                         &replica->pIn, &replica->pOut);
    if (rc != SQLITE_OK || atomic_load(&job->cancelled)) {
        foliole_backup_transport_shutdown(job);
        closeStream(origin->pIn);
        closeStream(origin->pOut);
        closeStream(replica->pIn);
        closeStream(replica->pOut);
        return rc != SQLITE_OK ? rc : SQLITE_INTERRUPT;
    }
    pthread_t thread;
    if (pthread_create(&thread, NULL, replicaThread, replica)) {
        foliole_backup_transport_shutdown(job);
        closeStream(origin->pIn);
        closeStream(origin->pOut);
        closeStream(replica->pIn);
        closeStream(replica->pOut);
        return SQLITE_ERROR;
    }
    originSide(origin);
    closeDb(origin);
    releaseSource(job);
    foliole_backup_transport_shutdown(job);
    fclose(origin->pOut);
    fclose(origin->pIn);
    pthread_join(thread, NULL);
    return origin->nErr || replica->nErr || !atomic_load(&job->committed) ? SQLITE_ERROR : SQLITE_OK;
}

/* Block SIGPIPE only on these workers, then consume only our pending signal
 * before restoring the caller's mask; never change the App's process handler. */
static void restoreSignalMask(const sigset_t *original, int alreadyPending) {
    sigset_t pending;
    sigpending(&pending);
    if (sigismember(&pending, SIGPIPE) && !alreadyPending) {
        sigset_t pipeSignal;
        sigemptyset(&pipeSignal);
        sigaddset(&pipeSignal, SIGPIPE);
        int signal;
        sigwait(&pipeSignal, &signal);
    }
    pthread_sigmask(SIG_SETMASK, original, NULL);
}

int foliole_backup_run(FolioleBackupJob *job, FolioleBackupResult *result) {
    if (!job || !result) return SQLITE_MISUSE;
    int expected = 0;
    if (!atomic_compare_exchange_strong(&job->state, &expected, 1)) return SQLITE_MISUSE;
    clock_gettime(CLOCK_MONOTONIC, &job->started);
    sigset_t blocked, original;
    sigemptyset(&blocked);
    sigaddset(&blocked, SIGPIPE);
    pthread_sigmask(SIG_BLOCK, &blocked, &original);
    sigset_t pending;
    sigpending(&pending);
    int alreadyPending = sigismember(&pending, SIGPIPE);
    SQLiteRsync origin = {0}, replica = {0};
    origin.job = replica.job = job;
    origin.zOrigin = replica.zOrigin = job->source;
    origin.zReplica = replica.zReplica = job->target;
    origin.iProtocol = replica.iProtocol = PROTOCOL_VERSION;
    int rc = runEndpoints(job, &origin, &replica);
    releaseSource(job);
    foliole_backup_transport_close(job);
    restoreSignalMask(&original, alreadyPending);
    memset(result, 0, sizeof(*result));
    result->code = atomic_load(&job->cancelled) ? SQLITE_INTERRUPT : rc;
    result->committed = atomic_load(&job->committed);
    result->cleanupPending = atomic_load(&job->cleanupPending);
    result->sourcePages = origin.nPage;
    result->pagesSent = origin.nPageSent;
    snprintf(result->message, sizeof(result->message), "%s", job->message);
    snprintf(result->fingerprint, sizeof(result->fingerprint), "%s", job->fingerprint);
    atomic_store(&job->state, 2);
    return result->code;
}

uintptr_t foliole_backup_engine_address(void) {
    return (uintptr_t)&sqlite3_open_v2;
}
