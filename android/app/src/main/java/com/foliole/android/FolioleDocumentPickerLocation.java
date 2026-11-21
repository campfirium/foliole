package com.foliole.android;

import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;

/**
 * Opens system document pickers at shared-storage Documents, where long-lived backups belong.
 * Only the initial location changes; the user can still browse anywhere, and pickers that
 * ignore the hint keep their own default. EXTRA_INITIAL_URI exists since API 26, below minSdk 28.
 */
final class FolioleDocumentPickerLocation {
    static final String EXTERNAL_STORAGE_AUTHORITY = "com.android.externalstorage.documents";
    static final String DOCUMENTS_DOCUMENT_ID = "primary:Documents";

    private FolioleDocumentPickerLocation() {}

    /** Document URI string of primary/Documents, encoded the way DocumentsContract.buildDocumentUri does. */
    static String documentsInitialUri() {
        return "content://" + EXTERNAL_STORAGE_AUTHORITY + "/document/" + DOCUMENTS_DOCUMENT_ID.replace(":", "%3A");
    }

    static Intent startInDocuments(Intent intent) {
        return intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI, Uri.parse(documentsInitialUri()));
    }
}
