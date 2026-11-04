package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.content.Context;
import android.content.Intent;
import android.content.UriPermission;
import android.net.Uri;
import android.os.Bundle;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Exercises the real provider grant boundary using only the acceptance application's own grant. */
@RunWith(AndroidJUnit4.class)
public class FolioleFolderBackupGrantTest {
    @Test public void releasingOwnGrantPreservesProfileAndDeniesProviderAccess() throws Exception {
        var instrumentation = InstrumentationRegistry.getInstrumentation();
        Context context = instrumentation.getTargetContext();
        assertEquals("com.campfirium.foliole.android.acceptance", context.getPackageName());
        FolioleFolderBackupProfile store = new FolioleFolderBackupProfile(context);
        JSONObject before = store.load();
        assertTrue("Select a backup folder through the product before running this test", before != null);
        Uri tree = Uri.parse(before.getString("tree"));
        assertTrue("The selected directory must have a persisted grant", hasGrant(context, tree));
        var documents = new FolioleFolderBackupDocuments(context, tree);
        assertTrue(documents.find("Foliole.sqlite") != null);

        context.getContentResolver().releasePersistableUriPermission(tree,
            Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);

        assertFalse("The system must revoke the persisted grant", hasGrant(context, tree));
        try {
            documents.find("Foliole.sqlite");
            fail("The real DocumentsProvider still allowed access after revocation");
        } catch (SecurityException expected) {
            // The provider rejection is observed, not replaced by a mock or a forced backup error.
        }
        JSONObject after = store.load();
        assertEquals(before.toString(), after.toString());
        Bundle receipt = new Bundle();
        receipt.putString("folioleBackupGrantReceipt", new JSONObject()
            .put("directoryId", before.getString("id"))
            .put("grantReleased", true).put("providerDenied", true)
            .put("profileRetained", true).toString());
        instrumentation.sendStatus(2, receipt);
    }

    private static boolean hasGrant(Context context, Uri tree) {
        for (UriPermission permission : context.getContentResolver().getPersistedUriPermissions()) {
            if (tree.equals(permission.getUri()) && permission.isReadPermission() && permission.isWritePermission()) {
                return true;
            }
        }
        return false;
    }
}
