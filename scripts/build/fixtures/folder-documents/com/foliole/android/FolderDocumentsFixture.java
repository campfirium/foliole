package com.foliole.android;

import android.content.Context;
import android.net.Uri;
import android.provider.DocumentsContract;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
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
    private void run(boolean failBeforeCreate) throws Exception {
        Properties properties = load();
        boolean owned = Boolean.parseBoolean(properties.getProperty("owned"));
        boolean pending = Boolean.parseBoolean(properties.getProperty("pending"));
        Runnable begin = () -> { save("pending"); if (failBeforeCreate) throw new IllegalStateException("stopped before create"); };
        Runnable complete = () -> save("owned");
        try {
            // Run the earlier implementation too: a missing new overload is never the red assertion.
            try {
                Method method = FolioleFolderBackupDocuments.class.getDeclaredMethod("prepare",
                    boolean.class, boolean.class, Runnable.class, Runnable.class);
                method.invoke(this, owned, pending, begin, complete);
            } catch (NoSuchMethodException oldImplementation) { prepareLegacy(owned, complete); }
        } catch (InvocationTargetException error) { throw (Exception) error.getCause(); }
    }
    private void prepareLegacy(boolean owned, Runnable complete) throws Exception {
        FolioleFolderBackupDocuments.class.getDeclaredMethod("prepare", boolean.class, Runnable.class)
            .invoke(this, owned, complete);
    }
    private static void expectFailure(FolderDocumentsFixture fixture, boolean before) throws Exception {
        try { fixture.run(before); } catch (Exception expected) { return; }
        throw new AssertionError("Expected the interrupted or foreign operation to fail");
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
