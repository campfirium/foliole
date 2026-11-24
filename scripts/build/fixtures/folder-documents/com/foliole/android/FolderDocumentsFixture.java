package com.foliole.android;

import android.content.Context;
import android.net.Uri;
import android.provider.DocumentsContract;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Properties;

public class FolderDocumentsFixture extends FolioleFolderBackupDocuments {
    private final Path root;
    private final Path profile;
    FolderDocumentsFixture(Path root) throws Exception {
        super(new Context(), Uri.parse(root.toString()));
        this.root = root;
        this.profile = root.resolve("profile.properties");
    }
    @Override Uri find(String name) {
        Path file = root.resolve(name);
        return Files.exists(file) ? Uri.parse(file.toString()) : null;
    }
    private Properties load() throws Exception {
        Properties properties = new Properties();
        if (Files.exists(profile)) try (var input = Files.newInputStream(profile)) { properties.load(input); }
        return properties;
    }
    private void save(String field) {
        try {
            Properties properties = load();
            properties.setProperty(field, "true");
            if (field.equals("owned")) properties.remove("pending");
            try (var output = Files.newOutputStream(profile)) { properties.store(output, ""); }
        } catch (Exception error) { throw new IllegalStateException(error); }
    }
    private void forget(boolean failAfterForget) {
        try {
            if (Files.exists(root.resolve("Foliole.sqlite"))) throw new AssertionError("Forgot a backup that still exists");
            Properties properties = load();
            properties.setProperty("owned", "false");
            properties.setProperty("forgotten", "true");
            properties.remove("fingerprint");
            try (var output = Files.newOutputStream(profile)) { properties.store(output, ""); }
        } catch (Exception error) { throw new IllegalStateException(error); }
        if (failAfterForget) throw new IllegalStateException("stopped after forgetting");
    }
    private void run(boolean failBeforeCreate) throws Exception { run(failBeforeCreate, false); }
    private void run(boolean failBeforeCreate, boolean failAfterForget) throws Exception {
        Properties properties = load();
        boolean owned = Boolean.parseBoolean(properties.getProperty("owned"));
        boolean pending = Boolean.parseBoolean(properties.getProperty("pending"));
        Runnable begin = () -> { save("pending"); if (failBeforeCreate) throw new IllegalStateException("stopped before create"); };
        Runnable complete = () -> save("owned");
        Runnable forget = () -> forget(failAfterForget);
        try {
            // Run the earlier implementations too: a missing new overload is never the red assertion.
            try {
                Method method = FolioleFolderBackupDocuments.class.getDeclaredMethod("prepare",
                    boolean.class, boolean.class, Runnable.class, Runnable.class, Runnable.class);
                method.invoke(this, owned, pending, begin, complete, forget);
            } catch (NoSuchMethodException previous) {
                try {
                    FolioleFolderBackupDocuments.class.getDeclaredMethod("prepare",
                        boolean.class, boolean.class, Runnable.class, Runnable.class).invoke(this, owned, pending, begin, complete);
                } catch (NoSuchMethodException oldImplementation) { prepareLegacy(owned, complete); }
            }
        } catch (InvocationTargetException error) { throw (Exception) error.getCause(); }
    }
    private static void recreateRemovedBackup(Path root, Path file, boolean failAfterForget) throws Exception {
        FolderDocumentsFixture first = new FolderDocumentsFixture(root);
        first.run(false);
        Properties established = first.load();
        established.setProperty("fingerprint", "retained");
        try (var output = Files.newOutputStream(first.profile)) { established.store(output, ""); }
        Files.write(file, new byte[] { 1, 2, 3 });
        Files.delete(file); // the user removed the backup from the folder that still belongs to Foliole
        if (failAfterForget) {
            expectFailure(new FolderDocumentsFixture(root), () -> new FolderDocumentsFixture(root).run(false, true));
            if (Files.exists(file)) throw new AssertionError("Created before forgetting the removed backup");
        }
        new FolderDocumentsFixture(root).run(false);
        Properties recreated = first.load();
        if (!Files.exists(file) || Files.size(file) != 0) throw new AssertionError("Removed backup was not recreated");
        if (!Boolean.parseBoolean(recreated.getProperty("owned")) || recreated.getProperty("fingerprint") != null
            || !Boolean.parseBoolean(recreated.getProperty("forgotten"))) {
            throw new AssertionError("Recreated backup kept the removed backup's identity");
        }
        System.out.println("removed backup recreated");
    }
    private interface Attempt { void run() throws Exception; }
    private static void expectFailure(FolderDocumentsFixture ignored, Attempt attempt) throws Exception {
        try { attempt.run(); } catch (Exception expected) { return; }
        throw new AssertionError("Expected the interrupted operation to fail");
    }
    private void prepareLegacy(boolean owned, Runnable complete) throws Exception {
        FolioleFolderBackupDocuments.class.getDeclaredMethod("prepare", boolean.class, Runnable.class)
            .invoke(this, owned, complete);
    }
    private static void expectFailure(FolderDocumentsFixture fixture, boolean before) throws Exception {
        try { fixture.run(before); } catch (Exception expected) { return; }
        throw new AssertionError("Expected the interrupted or foreign operation to fail");
    }
    private static void replace(FolderDocumentsFixture first, Path target, Path external, Path candidate, String scenario) throws Exception {
        byte[] previousBytes = Files.readAllBytes(external);
        byte[] candidateBytes = Files.readAllBytes(candidate);
        Path journal = target.resolveSibling("Foliole.sqlite-journal");
        Files.write(target, previousBytes);
        Files.write(journal, new byte[] { 7 });
        Properties properties = first.load();
        FolioleFolderBackupReplacement replacement = first.replacement("test");
        replacement.requireEmptySlots();
        Uri previous = first.foreignTarget(false, false);
        if (scenario.endsWith("create-failed")) {
            DocumentsContract.failBeforeCreate = true;
            expectFailure(first, replacement::begin);
        } else {
            replacement.begin();
            Path stage = target.resolveSibling("Foliole.sqlite.partial-test.sqlite");
            if (!Files.exists(stage) || Files.size(stage) != 0) throw new AssertionError("The new target was not empty before the snapshot");
            if (!Arrays.equals(previousBytes, Files.readAllBytes(target))) throw new AssertionError("Staging altered the previous backup");
            Files.write(stage, scenario.endsWith("write-failed") ? Arrays.copyOf(candidateBytes, 32) : candidateBytes);
            if (scenario.endsWith("publish-failed") || scenario.endsWith("provider-failed")) {
                if (scenario.endsWith("provider-failed")) DocumentsContract.changeNextRenameTo = replacement.recoveryName();
                else DocumentsContract.failNextRenameTo = "Foliole.sqlite";
                expectFailure(first, () -> replacement.publish(previous, () -> first.save("owned")));
            } else if (scenario.endsWith("metadata-failed")) {
                expectFailure(first, () -> replacement.publish(previous, () -> { throw new IllegalStateException("Cannot save profile"); }));
                Path retained = target.resolveSibling(replacement.recoveryName());
                if (!Arrays.equals(previousBytes, Files.readAllBytes(retained))) throw new AssertionError("Previous backup was discarded before ownership was recorded");
                if (!Arrays.equals(candidateBytes, Files.readAllBytes(target))) throw new AssertionError("Published backup was lost");
                if (!new FolderDocumentsFixture(first.root).replacement("test").recover()) throw new AssertionError("Published backup was not recognized on retry");
                System.out.println("both backups survive metadata failure");
                return;
            } else if (!scenario.endsWith("write-failed")) {
                replacement.publish(previous, () -> first.save("owned"));
                replacement.discardPrevious();
                if (!Arrays.equals(candidateBytes, Files.readAllBytes(target))) throw new AssertionError("Other backup was not replaced");
                if (Files.exists(journal)) throw new AssertionError("Other backup journal kept");
                if (!Boolean.parseBoolean(first.load().getProperty("owned")) || properties.getProperty("owned") != null) {
                    throw new AssertionError("Replaced backup is not owned");
                }
                System.out.println("other backup replaced");
                return;
            }
        }
        // A fresh instance can find and restore the retained original after an interrupted publication.
        if (new FolderDocumentsFixture(first.root).replacement("test").recover()) throw new AssertionError("Failed replacement was published");
        if (!Files.exists(target) || !Arrays.equals(previousBytes, Files.readAllBytes(target))) {
            throw new AssertionError("Failed replacement lost the previous backup");
        }
        if (!Arrays.equals(new byte[] { 7 }, Files.readAllBytes(journal))) throw new AssertionError("Failed replacement lost the journal");
        if (first.load().getProperty("owned") != null) throw new AssertionError("Failed replacement claimed ownership");
        System.out.println("old backup survives replacement failure");
    }

    public static void main(String[] args) throws Exception {
        Path root = Path.of(args[1]);
        Files.createDirectories(root);
        Path file = root.resolve("Foliole.sqlite");
        FolderDocumentsFixture first = new FolderDocumentsFixture(root);
        switch (args[0]) {
            case "after-create":
                DocumentsContract.crashAfterCreate = true;
                expectFailure(first, false);
                if (!Files.exists(file) || Files.size(file) != 0) throw new AssertionError("Missing interrupted file");
                new FolderDocumentsFixture(root).run(false);
                break;
            case "before-create":
                expectFailure(first, true);
                if (Files.exists(file)) throw new AssertionError("Created before durable intent succeeded");
                new FolderDocumentsFixture(root).run(false);
                break;
            case "foreign-empty":
            case "foreign-nonempty":
                Files.write(file, args[0].equals("foreign-empty") ? new byte[0] : Files.readAllBytes(Path.of(args[2])));
                byte[] original = Files.readAllBytes(file);
                expectFailure(first, false);
                if (!java.util.Arrays.equals(original, Files.readAllBytes(file))) throw new AssertionError("Foreign file changed");
                System.out.println("external facts retained");
                return;
            case "owned-missing":
            case "owned-missing-interrupted":
                recreateRemovedBackup(root, file, args[0].endsWith("interrupted"));
                return;
            case "foreign-replace-create-failed":
            case "foreign-replace-write-failed":
            case "foreign-replace-publish-failed":
            case "foreign-replace-provider-failed":
            case "foreign-replace-metadata-failed":
            case "foreign-replaced":
                replace(first, file, Path.of(args[2]), Path.of(args[3]), args[0]);
                return;
            case "pending-foreign":
                expectFailure(first, true);
                Files.write(file, Files.readAllBytes(Path.of(args[2])));
                expectFailure(new FolderDocumentsFixture(root), false);
                System.out.println("external facts retained");
                return;
            default: throw new AssertionError("Unknown scenario");
        }
        if (!Boolean.parseBoolean(first.load().getProperty("owned"))) throw new AssertionError("Ownership was not durable");
        new FolderDocumentsFixture(root).run(false);
        System.out.println("interrupted creation resumed");
    }
}
