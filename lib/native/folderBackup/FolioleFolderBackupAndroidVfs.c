#include "FolioleFolderBackupAndroid.h"
#include <string.h>
#include <stdio.h>
#include <unistd.h>
#include <sys/stat.h>

JNIEnv *foliole_android_env(FolioleAndroidBackup *backup, int *attached) {
    JNIEnv *env = 0;
    *attached = 0;
    if ((*backup->vm)->GetEnv(backup->vm, (void **)&env, JNI_VERSION_1_6) != JNI_OK) {
        #ifdef __ANDROID__
        if ((*backup->vm)->AttachCurrentThread(backup->vm, &env, 0) != JNI_OK) return 0;
#else
        if ((*backup->vm)->AttachCurrentThread(backup->vm, (void **)&env, 0) != JNI_OK) return 0;
#endif
        *attached = 1;
    }
    return env;
}

void foliole_android_detach(FolioleAndroidBackup *backup, int attached) {
    if (attached) (*backup->vm)->DetachCurrentThread(backup->vm);
}

int foliole_android_failed(JNIEnv *env) {
    if (!(*env)->ExceptionCheck(env)) return 0;
    (*env)->ExceptionClear(env);
    return 1;
}

static int safOpen(sqlite3_vfs *vfs, const char *name, sqlite3_file *file, int flags, int *outFlags) {
    FolioleAndroidBackup *backup = vfs->pAppData;
    memset(file, 0, sizeof(FolioleSafFile));
    if (!name) return SQLITE_CANTOPEN;
    int attached;
    JNIEnv *env = foliole_android_env(backup, &attached);
    if (!env) return SQLITE_CANTOPEN;
    jstring key = (*env)->NewStringUTF(env, name);
    int fd = (*env)->CallIntMethod(env, backup->documents, backup->open, key, flags);
    (*env)->DeleteLocalRef(env, key);
    int failed = foliole_android_failed(env);
    foliole_android_detach(backup, attached);
    if (failed || fd < 0) return SQLITE_CANTOPEN;
    struct stat target, source;
    if (fstat(fd, &target) || !S_ISREG(target.st_mode) || stat(backup->source, &source)
        || (target.st_dev == source.st_dev && target.st_ino == source.st_ino)) {
        close(fd);
        return SQLITE_CANTOPEN;
    }
    FolioleSafFile *saf = (FolioleSafFile *)file;
    saf->fd = fd;
    saf->base.pMethods = &foliole_saf_io;
    if (outFlags) *outFlags = flags;
    return SQLITE_OK;
}

static int safBoolean(sqlite3_vfs *vfs, const char *name, jmethodID method, int *value) {
    FolioleAndroidBackup *backup = vfs->pAppData;
    int attached;
    JNIEnv *env = foliole_android_env(backup, &attached);
    if (!env) return SQLITE_IOERR;
    jstring key = (*env)->NewStringUTF(env, name);
    *value = (*env)->CallBooleanMethod(env, backup->documents, method, key);
    (*env)->DeleteLocalRef(env, key);
    int failed = foliole_android_failed(env);
    foliole_android_detach(backup, attached);
    return failed ? SQLITE_IOERR : SQLITE_OK;
}

static int safDelete(sqlite3_vfs *vfs, const char *name, int syncDirectory) {
    (void)syncDirectory; /* SAF exposes descriptor fsync, not directory fsync. */
    int removed = 0;
    int rc = safBoolean(vfs, name, ((FolioleAndroidBackup *)vfs->pAppData)->remove, &removed);
    return rc == SQLITE_OK && removed ? SQLITE_OK : SQLITE_IOERR_DELETE;
}

static int safAccess(sqlite3_vfs *vfs, const char *name, int flags, int *exists) {
    (void)flags;
    return safBoolean(vfs, name, ((FolioleAndroidBackup *)vfs->pAppData)->exists, exists);
}

static int safPath(sqlite3_vfs *vfs, const char *name, int length, char *out) {
    (void)vfs;
    if ((int)strlen(name) >= length) return SQLITE_CANTOPEN;
    memcpy(out, name, strlen(name) + 1);
    return SQLITE_OK;
}

int foliole_saf_install(FolioleAndroidBackup *backup) {
    backup->vfs = *sqlite3_vfs_find(0);
    snprintf(backup->name, sizeof(backup->name), "foliole-saf-%p", (void *)backup);
    backup->vfs.zName = backup->name;
    backup->vfs.pNext = 0;
    backup->vfs.pAppData = backup;
    if (backup->vfs.szOsFile < (int)sizeof(FolioleSafFile)) backup->vfs.szOsFile = sizeof(FolioleSafFile);
    backup->vfs.xOpen = safOpen;
    backup->vfs.xDelete = safDelete;
    backup->vfs.xAccess = safAccess;
    backup->vfs.xFullPathname = safPath;
    return sqlite3_vfs_register(&backup->vfs, 0);
}
