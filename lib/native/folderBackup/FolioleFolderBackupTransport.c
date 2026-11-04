#include "FolioleFolderBackupInternal.h"
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <unistd.h>

static FILE *stream(int socket, const char *mode) {
    int descriptor = dup(socket);
    if (descriptor < 0) return NULL;
    FILE *file = fdopen(descriptor, mode);
    if (!file) close(descriptor);
    return file;
}

int foliole_backup_transport_open(FolioleBackupJob *job, FILE **originIn,
    FILE **originOut, FILE **replicaIn, FILE **replicaOut) {
    int sockets[2];
    if (socketpair(AF_UNIX, SOCK_STREAM, 0, sockets)) return SQLITE_CANTOPEN;
    struct timeval timeout = {
        job->options.timeoutMilliseconds / 1000,
        (job->options.timeoutMilliseconds % 1000) * 1000
    };
    for (int i = 0; i < 2; i++) {
        if (setsockopt(sockets[i], SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout))
            || setsockopt(sockets[i], SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout))) {
            close(sockets[0]);
            close(sockets[1]);
            return SQLITE_IOERR;
        }
    }
    pthread_mutex_lock(&job->mutex);
    job->sockets[0] = sockets[0];
    job->sockets[1] = sockets[1];
    pthread_mutex_unlock(&job->mutex);
    *originIn = stream(sockets[0], "rb");
    *originOut = stream(sockets[0], "wb");
    *replicaIn = stream(sockets[1], "rb");
    *replicaOut = stream(sockets[1], "wb");
    return *originIn && *originOut && *replicaIn && *replicaOut ? SQLITE_OK : SQLITE_CANTOPEN;
}

void foliole_backup_transport_shutdown(FolioleBackupJob *job) {
    pthread_mutex_lock(&job->mutex);
    for (int i = 0; i < 2; i++) {
        if (job->sockets[i] >= 0) shutdown(job->sockets[i], SHUT_RDWR);
    }
    pthread_mutex_unlock(&job->mutex);
}

void foliole_backup_transport_close(FolioleBackupJob *job) {
    pthread_mutex_lock(&job->mutex);
    for (int i = 0; i < 2; i++) {
        if (job->sockets[i] >= 0) close(job->sockets[i]);
        job->sockets[i] = -1;
    }
    pthread_mutex_unlock(&job->mutex);
}

void foliole_backup_transport_finish(FolioleBackupJob *job, int endpoint) {
    pthread_mutex_lock(&job->mutex);
    if (job->sockets[endpoint] >= 0) close(job->sockets[endpoint]);
    job->sockets[endpoint] = -1;
    pthread_mutex_unlock(&job->mutex);
}

int foliole_backup_should_stop(FolioleBackupJob *job) {
    if (atomic_load(&job->cancelled)) return 1;
    struct timespec now;
    clock_gettime(CLOCK_MONOTONIC, &now);
    int64_t elapsed = (now.tv_sec - job->started.tv_sec) * 1000
        + (now.tv_nsec - job->started.tv_nsec) / 1000000;
    if (elapsed < job->options.timeoutMilliseconds) return 0;
    foliole_backup_cancel(job);
    return 1;
}

void foliole_backup_cancel(FolioleBackupJob *job) {
    if (!job || atomic_load(&job->state) == 2) return;
    atomic_store(&job->cancelled, 1);
    pthread_mutex_lock(&job->mutex);
    for (int i = 0; i < 2; i++) {
        if (job->connections[i]) sqlite3_interrupt(job->connections[i]);
    }
    pthread_mutex_unlock(&job->mutex);
    foliole_backup_transport_shutdown(job);
}

static int validFingerprint(const char *value) {
    return !value || (strlen(value) == 40 && strspn(value, "0123456789abcdef") == 40);
}

FolioleBackupJob *foliole_backup_create(const char *source, const char *target,
                                      const FolioleBackupOptions *options) {
    if (!source || !target || !options || !strcmp(source, target)
        || options->timeoutMilliseconds < 100 || options->timeoutMilliseconds > 30000
        || !validFingerprint(options->expectedFingerprint) || !validFingerprint(options->pendingFingerprint)) return NULL;
    FolioleBackupJob *job = calloc(1, sizeof(*job));
    if (!job) return NULL;
    job->source = strdup(source);
    job->target = strdup(target);
    if (!job->source || !job->target || pthread_mutex_init(&job->mutex, NULL)) {
        free(job->source);
        free(job->target);
        free(job);
        return NULL;
    }
    atomic_init(&job->state, 0);
    atomic_init(&job->cancelled, 0);
    atomic_init(&job->committed, 0);
    atomic_init(&job->cleanupPending, 0);
    atomic_init(&job->sourceReleased, 0);
    job->sockets[0] = job->sockets[1] = -1;
    job->options = *options;
    job->options.expectedFingerprint = options->expectedFingerprint ? strdup(options->expectedFingerprint) : NULL;
    job->options.pendingFingerprint = options->pendingFingerprint ? strdup(options->pendingFingerprint) : NULL;
    if ((options->expectedFingerprint && !job->options.expectedFingerprint)
        || (options->pendingFingerprint && !job->options.pendingFingerprint)) {
        foliole_backup_destroy(job);
        return NULL;
    }
    return job;
}

int foliole_backup_destroy(FolioleBackupJob *job) {
    if (!job) return SQLITE_OK;
    if (atomic_load(&job->state) == 1) return SQLITE_BUSY;
    foliole_backup_transport_close(job);
    pthread_mutex_destroy(&job->mutex);
    free(job->source);
    free(job->target);
    free((void *)job->options.expectedFingerprint);
    free((void *)job->options.pendingFingerprint);
    free(job);
    return SQLITE_OK;
}
