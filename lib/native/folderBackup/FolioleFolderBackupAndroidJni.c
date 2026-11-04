#include "FolioleFolderBackupAndroid.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

static int prepared(void *context, const char *fingerprint) {
    FolioleAndroidBackup *backup = context;
    int attached;
    JNIEnv *env = foliole_android_env(backup, &attached);
    if (!env) return SQLITE_IOERR;
    jstring value = (*env)->NewStringUTF(env, fingerprint);
    (*env)->CallVoidMethod(env, backup->documents, backup->prepared, value);
    (*env)->DeleteLocalRef(env, value);
    int failed = foliole_android_failed(env);
    foliole_android_detach(backup, attached);
    return failed ? SQLITE_IOERR : SQLITE_OK;
}

static void notify(FolioleAndroidBackup *backup, jmethodID method) {
    int attached;
    JNIEnv *env = foliole_android_env(backup, &attached);
    if (!env) return;
    (*env)->CallVoidMethod(env, backup->documents, method);
    foliole_android_failed(env);
    foliole_android_detach(backup, attached);
}
static void committed(void *context) { FolioleAndroidBackup *b = context; notify(b, b->committed); }
static void released(void *context) { FolioleAndroidBackup *b = context; notify(b, b->released); }

JNIEXPORT jlong JNICALL Java_com_foliole_android_FolioleFolderBackupOperation_createNative(
    JNIEnv *env, jobject object, jstring source, jstring expected, jstring pending) {
    FolioleAndroidBackup *backup = calloc(1, sizeof(*backup));
    if (!backup) return 0;
    (*env)->GetJavaVM(env, &backup->vm);
    backup->documents = (*env)->NewGlobalRef(env, object);
    jclass cls = (*env)->GetObjectClass(env, object);
    backup->open = (*env)->GetMethodID(env, cls, "openFile", "(Ljava/lang/String;I)I");
    backup->remove = (*env)->GetMethodID(env, cls, "deleteFile", "(Ljava/lang/String;)Z");
    backup->exists = (*env)->GetMethodID(env, cls, "exists", "(Ljava/lang/String;)Z");
    backup->prepared = (*env)->GetMethodID(env, cls, "snapshotPrepared", "(Ljava/lang/String;)V");
    backup->committed = (*env)->GetMethodID(env, cls, "transactionCommitted", "()V");
    backup->released = (*env)->GetMethodID(env, cls, "sourceReleased", "()V");
    (*env)->DeleteLocalRef(env, cls);
    const char *path = (*env)->GetStringUTFChars(env, source, 0);
    backup->source = strdup(path);
    (*env)->ReleaseStringUTFChars(env, source, path);
    const char *last = expected ? (*env)->GetStringUTFChars(env, expected, 0) : 0;
    const char *next = pending ? (*env)->GetStringUTFChars(env, pending, 0) : 0;
    FolioleBackupOptions options = { .timeoutMilliseconds = 30000, .context = backup,
        .expectedFingerprint = last, .pendingFingerprint = next, .snapshotPrepared = prepared,
        .transactionCommitted = committed, .sourceReleased = released };
    char target[192];
    if (!foliole_android_failed(env) && backup->source && foliole_saf_install(backup) == SQLITE_OK) {
        snprintf(target, sizeof(target), "file:/foliole-backup/Foliole.sqlite?vfs=%s", backup->name);
        backup->job = foliole_backup_create(backup->source, target, &options);
    }
    if (last) (*env)->ReleaseStringUTFChars(env, expected, last);
    if (next) (*env)->ReleaseStringUTFChars(env, pending, next);
    if (!backup->job) {
        sqlite3_vfs_unregister(&backup->vfs);
        (*env)->DeleteGlobalRef(env, backup->documents);
        free(backup->source); free(backup);
        return 0;
    }
    return (jlong)(intptr_t)backup;
}

JNIEXPORT jobjectArray JNICALL Java_com_foliole_android_FolioleFolderBackupOperation_runNative(
    JNIEnv *env, jobject object, jlong handle) {
    (void)object;
    FolioleAndroidBackup *backup = (void *)(intptr_t)handle;
    FolioleBackupResult result;
    foliole_backup_run(backup->job, &result);
    char code[32], pages[32], sent[32];
    snprintf(code, sizeof(code), "%d", result.code);
    snprintf(pages, sizeof(pages), "%u", result.sourcePages);
    snprintf(sent, sizeof(sent), "%u", result.pagesSent);
    const char *values[] = { code, result.committed ? "1" : "0", result.cleanupPending ? "1" : "0", pages, sent, result.message };
    jclass string = (*env)->FindClass(env, "java/lang/String");
    jobjectArray output = (*env)->NewObjectArray(env, 6, string, 0);
    for (int index = 0; index < 6; index++) {
        jstring value = (*env)->NewStringUTF(env, values[index]);
        (*env)->SetObjectArrayElement(env, output, index, value);
        (*env)->DeleteLocalRef(env, value);
    }
    (*env)->DeleteLocalRef(env, string);
    return output;
}

JNIEXPORT void JNICALL Java_com_foliole_android_FolioleFolderBackupOperation_cancelNative(
    JNIEnv *env, jobject object, jlong handle) {
    (void)env; (void)object;
    foliole_backup_cancel(((FolioleAndroidBackup *)(intptr_t)handle)->job);
}

JNIEXPORT void JNICALL Java_com_foliole_android_FolioleFolderBackupOperation_destroyNative(
    JNIEnv *env, jobject object, jlong handle) {
    (void)object;
    FolioleAndroidBackup *backup = (void *)(intptr_t)handle;
    foliole_backup_destroy(backup->job);
    sqlite3_vfs_unregister(&backup->vfs);
    (*env)->DeleteGlobalRef(env, backup->documents);
    free(backup->source); free(backup);
}
