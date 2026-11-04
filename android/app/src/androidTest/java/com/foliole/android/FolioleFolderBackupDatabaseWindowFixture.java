package com.foliole.android;

import static org.junit.Assert.*;
import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.system.Os;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** Reports an observed real pager-write window to the existing controlled-stop mechanics. */
@RunWith(AndroidJUnit4.class)
public class FolioleFolderBackupDatabaseWindowFixture {
    @Test public void reportsChangedPageBytesWhileTheRollbackJournalIsStillHot() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Context context = instrumentation.getTargetContext();
        assertEquals("com.campfirium.foliole.android.acceptance", context.getPackageName());
        JSONObject profile = new FolioleFolderBackupProfile(context).load();
        assertNotNull(profile);
        FolioleFolderBackupDocuments documents = new FolioleFolderBackupDocuments(context, Uri.parse(profile.getString("tree")));
        Uri main = documents.find("Foliole.sqlite");
        assertNotNull(main);
        Activity activity = start(instrumentation, context);
        try (ParcelFileDescriptor descriptor = context.getContentResolver().openFileDescriptor(main, "r")) {
            assertNotNull(descriptor);
            long oldSize = descriptor.getStatSize();
            byte[] original = new byte[4096];
            assertEquals(original.length, Os.pread(descriptor.getFileDescriptor(), original, 0, original.length, 4096));
            WebView view = activity.findViewById(R.id.webview);
            FolioleCompanionSettingsNavigation.open(instrumentation, view);
            FolioleCompanionSemanticActions.clickVisible(instrumentation, view,
                "companion-settings-storage", deadline());
            FolioleCompanionSemanticActions.waitForUniqueVisible(instrumentation, view,
                "companion-database-backup", deadline());
            CompletableFuture<JSONObject> observed = new CompletableFuture<>();
            Thread monitor = new Thread(() -> {
                try { observed.complete(observe(context, documents, descriptor, oldSize, original)); }
                catch (Exception error) { observed.completeExceptionally(error); }
            }, "backup-window-fixture");
            monitor.start();
            FolioleCompanionSemanticActions.clickVisible(instrumentation, view,
                "companion-database-backup", deadline());
            JSONObject window = observed.get(25, TimeUnit.SECONDS);
            window.put("directoryId", profile.getString("id"));
            Bundle receipt = new Bundle();
            receipt.putString("folioleDatabaseWriteWindow", window.toString());
            instrumentation.sendStatus(2, receipt);
            // The registered mechanics owns the actual process stop; this fixture never kills or delays production work.
            new CountDownLatch(1).await(30, TimeUnit.SECONDS);
            fail("The controlled-stop owner did not stop the instrumented process");
        } finally { instrumentation.runOnMainSync(activity::finish); }
    }

    private static JSONObject observe(Context context, FolioleFolderBackupDocuments documents,
        ParcelFileDescriptor main, long oldSize, byte[] original) throws Exception {
        long end = System.nanoTime() + TimeUnit.SECONDS.toNanos(20);
        ParcelFileDescriptor journal = null;
        try {
            while (System.nanoTime() < end) {
                if (journal == null) {
                    Uri uri = documents.find("Foliole.sqlite-journal");
                    if (uri != null) journal = context.getContentResolver().openFileDescriptor(uri, "r");
                }
                if (journal != null) {
                    var stat = Os.fstat(journal.getFileDescriptor());
                    long size = main.getStatSize();
                    byte[] header = new byte[8], page = new byte[4096];
                    if (stat.st_nlink > 0 && stat.st_size > 512
                        && Os.pread(journal.getFileDescriptor(), header, 0, header.length, 0) == header.length
                        && nonzero(header) && Os.pread(main.getFileDescriptor(), page, 0, page.length, 4096) == page.length
                        && !java.util.Arrays.equals(original, page)) {
                        return new JSONObject().put("oldBytes", oldSize).put("mainBytes", size)
                            .put("journalBytes", stat.st_size).put("journalLinked", true)
                            .put("journalHeaderNonzero", true).put("existingPageChanged", true).put("observedPageOffset", 4096);
                    }
                }
                Thread.sleep(1);
            }
            throw new IllegalStateException("No live database page-write window observed");
        } finally { if (journal != null) journal.close(); }
    }

    private static boolean nonzero(byte[] bytes) {
        for (byte value : bytes) if (value != 0) return true;
        return false;
    }
    private static long deadline() { return System.nanoTime() + TimeUnit.SECONDS.toNanos(30); }
    private static Activity start(Instrumentation instrumentation, Context context) {
        var monitor = instrumentation.addMonitor(MainActivity.class.getName(), null, false);
        Intent intent = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        context.startActivity(intent);
        Activity activity = instrumentation.waitForMonitorWithTimeout(monitor, 30000);
        instrumentation.removeMonitor(monitor);
        assertNotNull(activity);
        return activity;
    }
}
