package com.foliole.android;

import java.io.File;

final class FolioleCompanionAttachmentFileStage {
    private FolioleCompanionAttachmentFileStage() {}

    // The caller holds the library receiver lock across the existence check and atomic move.
    static boolean publishVerified(File source, File target, String hash) throws Exception {
        if (!hash.equals(FolioleCompanionAttachmentResourceHash.digestHex(source))) {
            throw new IllegalStateException("Attachment resource hash mismatch.");
        }
        if (target.exists() && hash.equals(FolioleCompanionAttachmentResourceHash.digestHex(target))) {
            java.nio.file.Files.delete(source.toPath());
            return false;
        }
        java.nio.file.Files.move(source.toPath(), target.toPath(),
            java.nio.file.StandardCopyOption.ATOMIC_MOVE, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        return true;
    }

}
