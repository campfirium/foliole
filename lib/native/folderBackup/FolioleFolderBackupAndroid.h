#ifndef FOLIOLE_FOLDER_BACKUP_ANDROID_H
#define FOLIOLE_FOLDER_BACKUP_ANDROID_H
#ifndef _FILE_OFFSET_BITS
#define _FILE_OFFSET_BITS 64
#endif
#include <sys/types.h>
_Static_assert(sizeof(off_t) == 8, "Backup descriptors require 64-bit file offsets");
#include <jni.h>
#include <pthread.h>
#include "sqlite3.h"
#include "FolioleFolderBackup.h"

typedef struct {
    JavaVM *vm;
    jobject documents;
    jmethodID open, remove, exists, prepared, committed, released;
    sqlite3_vfs vfs;
    char name[80];
    FolioleBackupJob *job;
    char *source;
} FolioleAndroidBackup;

typedef struct {
    sqlite3_file base;
    int fd, lock;
} FolioleSafFile;

extern const sqlite3_io_methods foliole_saf_io;
JNIEnv *foliole_android_env(FolioleAndroidBackup *, int *);
void foliole_android_detach(FolioleAndroidBackup *, int);
int foliole_android_failed(JNIEnv *);
int foliole_saf_install(FolioleAndroidBackup *);
#endif
