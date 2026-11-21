package com.foliole.android;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class FolioleDocumentPickerLocationTest {
    @Test
    public void initialLocationIsPrimaryDocumentsDocumentUri() {
        assertEquals(
            "content://com.android.externalstorage.documents/document/primary%3ADocuments",
            FolioleDocumentPickerLocation.documentsInitialUri()
        );
    }
}
