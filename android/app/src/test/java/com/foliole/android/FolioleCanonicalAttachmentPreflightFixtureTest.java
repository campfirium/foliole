package com.foliole.android;

import static org.junit.Assert.assertEquals;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.Test;

public final class FolioleCanonicalAttachmentPreflightFixtureTest {
    private static final Map<String, String> EXTENSIONS = Map.of(
        "application/pdf", ".pdf", "image/gif", ".gif", "image/jpeg", ".jpg",
        "image/png", ".png", "image/webp", ".webp"
    );

    @Test
    public void consumesSharedCanonicalAttachmentFixture() throws Exception {
        String json = Files.readString(findFixture());
        Matcher entries = Pattern.compile("\\{[^}]+\\}").matcher(json);
        int count = 0;
        while (entries.find()) {
            String entry = entries.group();
            String kind = field(entry, "expectedKind");
            assertEquals(optionalField(entry, "canonicalExtension"), EXTENSIONS.get(kind));
            count++;
        }
        assertEquals(9, count);
    }

    private static Path findFixture() {
        Path current = Path.of(System.getProperty("user.dir")).toAbsolutePath();
        for (int depth = 0; depth < 4; depth++) {
            Path candidate = current.resolve("lib/platform/fixtures/canonical-attachment-preflight-corpus.json");
            if (Files.isRegularFile(candidate)) return candidate;
            current = current.getParent();
        }
        throw new AssertionError("Shared canonical attachment fixture not found");
    }

    private static String field(String entry, String name) {
        String value = optionalField(entry, name);
        if (value == null) throw new AssertionError("Missing " + name);
        return value;
    }

    private static String optionalField(String entry, String name) {
        Matcher matcher = Pattern.compile("\\\"" + name + "\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"").matcher(entry);
        return matcher.find() ? matcher.group(1) : null;
    }
}
