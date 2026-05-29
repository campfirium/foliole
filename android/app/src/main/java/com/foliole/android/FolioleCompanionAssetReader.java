package com.foliole.android;

import android.content.Context;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

final class FolioleCompanionAssetReader {
    private FolioleCompanionAssetReader() {}

    static String read(Context context, String assetPath) throws Exception {
        try (InputStream input = context.getAssets().open(assetPath);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
            return output.toString("UTF-8");
        }
    }
}
