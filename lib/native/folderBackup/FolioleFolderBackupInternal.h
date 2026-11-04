#ifndef FOLIOLE_FOLDER_BACKUP_INTERNAL_H
#define FOLIOLE_FOLDER_BACKUP_INTERNAL_H

#include "FolioleFolderBackup.h"
#include "sqlite3.h"
#include <pthread.h>
#include <stdatomic.h>
#include <stdio.h>
#include <time.h>

struct FolioleBackupJob {
    char *source;
    char *target;
    FolioleBackupOptions options;
    pthread_mutex_t mutex;
    atomic_int state;
    atomic_int cancelled;
    atomic_int committed;
    atomic_int cleanupPending;
    atomic_int sourceReleased;
    int sockets[2];
    sqlite3 *connections[2];
    struct timespec started;
    char message[256];
    char fingerprint[41];
    int targetWasEmpty;
};

int foliole_backup_transport_open(FolioleBackupJob *job, FILE **originIn,
    FILE **originOut, FILE **replicaIn, FILE **replicaOut);
void foliole_backup_transport_shutdown(FolioleBackupJob *job);
void foliole_backup_transport_close(FolioleBackupJob *job);
void foliole_backup_transport_finish(FolioleBackupJob *job, int endpoint);
int foliole_backup_should_stop(FolioleBackupJob *job);

#endif
