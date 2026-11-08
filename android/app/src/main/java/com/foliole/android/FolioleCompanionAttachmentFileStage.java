package com.foliole.android;

import java.io.File;

final class FolioleCompanionAttachmentFileStage {
    private FolioleCompanionAttachmentFileStage() {}

    // The caller holds the library receiver lock across the existence check and atomic move.
    static boolean publishVerified(File source, File target, String hash) throws Exception {
        if (!hash.equals(FolioleCompanionAttachmentResourceHash.digestHex(source))) {
            throw new IllegalStateException("Attachment resource hash mismatch.");
        }
        return publish(source, target, hash, () -> {});
    }

    static boolean publishReceived(File source, File target, String hash, long length, Runnable check) throws Exception {
        FolioleAttachmentBlockFiles.checkedSourceFile(source);
        if (java.nio.file.Files.size(source.toPath()) != length) {
            throw new IllegalStateException("attachment_partial_length_changed");
        }
        check.run();
        if (!hash.equals(FolioleCompanionAttachmentResourceHash.digestHex(source))) return false;
        publish(source, target, hash, check);
        return true;
    }

    private static boolean publish(File source, File target, String hash, Runnable check) throws Exception {
        if (target.exists() && hash.equals(FolioleCompanionAttachmentResourceHash.digestHex(target))) {
            check.run();
            java.nio.file.Files.delete(source.toPath());
            return false;
        }
        check.run();
        java.nio.file.Files.move(source.toPath(), target.toPath(),
            java.nio.file.StandardCopyOption.ATOMIC_MOVE, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        return true;
    }

}
