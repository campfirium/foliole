package com.foliole.android.framed;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class FramedSyncContractSource {
    static class MessageVector {
        final byte[] bytes;
        final String name;
        final String payloadCase;

        MessageVector(String base64, String name, String payloadCase) {
            this.bytes = Base64.getDecoder().decode(base64);
            this.name = name;
            this.payloadCase = payloadCase;
        }
    }

    static final class MalformedVector {
        final byte[] bytes;
        final String name;

        MalformedVector(String hex, String name) {
            this.bytes = hex(hex);
            this.name = name;
        }
    }

    static final class MaliciousVector extends MessageVector {
        final String expectedError;
        final int frameType;

        MaliciousVector(String base64, String expectedError, int frameType,
                        String name, String payloadCase) {
            super(base64, name, payloadCase);
            this.expectedError = expectedError;
            this.frameType = frameType;
        }
    }

    static final class AcceptedVector extends MessageVector {
        final int frameType;

        AcceptedVector(String base64, int frameType, String name, String payloadCase) {
            super(base64, name, payloadCase);
            this.frameType = frameType;
        }
    }

    private static final Pattern MESSAGE = Pattern.compile(
        "\\{\\s*\"base64\": \"([^\"]+)\",\\s*\"byte_length\": (\\d+),\\s*" +
        "\"name\": \"([^\"]+)\",\\s*\"payload_case\": \"([^\"]+)\"\\s*}");
    private static final Pattern MALFORMED = Pattern.compile(
        "\\{\\s*\"hex\": \"([0-9a-f]+)\",\\s*\"name\": \"([^\"]+)\"\\s*}");
    private static final Pattern JSON_OBJECT = Pattern.compile("\\{([^{}]+)}", Pattern.DOTALL);
    private static final Pattern PROTOCOL_FIELD = Pattern.compile(
        "([A-Za-z][A-Za-z0-9_]*)\\s+([a-z][a-z0-9_]*)\\s*=\\s*(\\d+)\\s*;");

    private FramedSyncContractSource() {}

    static String proto() throws IOException {
        return read("lib/core/sync/proto/foliole/sync/v22/framed_sync.proto");
    }

    static String corpus() throws IOException {
        return read("lib/core/sync/fixtures/framed-sync-v22-golden.json");
    }

    static String maliciousCorpus() throws IOException {
        return read("lib/core/sync/fixtures/framed-sync-v22-malicious.json");
    }

    static List<MessageVector> messages() throws IOException {
        List<MessageVector> result = new ArrayList<>();
        Matcher matcher = MESSAGE.matcher(corpus());
        while (matcher.find()) {
            MessageVector vector = new MessageVector(matcher.group(1), matcher.group(3), matcher.group(4));
            if (vector.bytes.length != Integer.parseInt(matcher.group(2))) {
                throw new IllegalArgumentException("golden_byte_length_mismatch:" + vector.name);
            }
            result.add(vector);
        }
        return result;
    }

    static List<MalformedVector> malformedFrames() throws IOException {
        List<MalformedVector> result = new ArrayList<>();
        Matcher matcher = MALFORMED.matcher(corpus());
        while (matcher.find()) result.add(new MalformedVector(matcher.group(1), matcher.group(2)));
        return result;
    }

    static List<MaliciousVector> maliciousMessages() throws IOException {
        List<MaliciousVector> result = new ArrayList<>();
        String corpus = maliciousCorpus();
        Matcher matcher = JSON_OBJECT.matcher(corpus.substring(corpus.indexOf("\"messages\"")));
        while (matcher.find()) {
            String object = matcher.group(1);
            if (!object.contains("\"expected_error\"")) continue;
            MaliciousVector vector = new MaliciousVector(
                jsonString(object, "base64"), jsonString(object, "expected_error"),
                jsonInt(object, "frame_type"), jsonString(object, "name"),
                jsonString(object, "payload_case"));
            if (vector.bytes.length != jsonInt(object, "byte_length")) {
                throw new IllegalArgumentException("malicious_byte_length_mismatch:" + vector.name);
            }
            result.add(vector);
        }
        return result;
    }

    static List<AcceptedVector> acceptedMessages() throws IOException {
        String corpus = maliciousCorpus();
        int start = corpus.indexOf("\"accepted_messages\"");
        int end = corpus.indexOf("\"messages\"");
        Matcher matcher = JSON_OBJECT.matcher(corpus.substring(start, end));
        List<AcceptedVector> result = new ArrayList<>();
        while (matcher.find()) {
            String object = matcher.group(1);
            if (!object.contains("\"base64\"")) continue;
            AcceptedVector vector = new AcceptedVector(
                jsonString(object, "base64"), jsonInt(object, "frame_type"),
                jsonString(object, "name"), jsonString(object, "payload_case"));
            if (vector.bytes.length != jsonInt(object, "byte_length")) {
                throw new IllegalArgumentException("accepted_byte_length_mismatch:" + vector.name);
            }
            result.add(vector);
        }
        return result;
    }

    private static String jsonString(String object, String key) {
        Matcher matcher = Pattern.compile("\\\"" + key + "\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"")
            .matcher(object);
        if (!matcher.find()) throw new IllegalArgumentException("json_field_missing:" + key);
        return matcher.group(1);
    }

    private static int jsonInt(String object, String key) {
        Matcher matcher = Pattern.compile("\\\"" + key + "\\\"\\s*:\\s*(\\d+)").matcher(object);
        if (!matcher.find()) throw new IllegalArgumentException("json_field_missing:" + key);
        return Integer.parseInt(matcher.group(1));
    }

    static Map<Integer, String> protocolPayloads() throws IOException {
        String source = proto();
        int start = source.indexOf("message ProtocolMessage");
        int end = source.indexOf("\n  }\n}", start);
        if (start < 0 || end < 0) throw new IllegalArgumentException("protocol_message_missing");
        Matcher matcher = PROTOCOL_FIELD.matcher(source.substring(start, end));
        Map<Integer, String> result = new LinkedHashMap<>();
        while (matcher.find()) result.put(Integer.parseInt(matcher.group(3)), matcher.group(2));
        return result;
    }

    static String schemaSha256() throws IOException {
        Matcher matcher = Pattern.compile("\"schema_sha256\": \"([0-9a-f]{64})\"").matcher(corpus());
        if (!matcher.find()) throw new IllegalArgumentException("schema_hash_missing");
        return matcher.group(1);
    }

    static String sha256(String value) throws NoSuchAlgorithmException {
        byte[] digest = MessageDigest.getInstance("SHA-256")
            .digest(value.getBytes(StandardCharsets.UTF_8));
        StringBuilder hex = new StringBuilder();
        for (byte item : digest) hex.append(String.format("%02x", item & 0xff));
        return hex.toString();
    }

    private static String read(String relative) throws IOException {
        Path cursor = Paths.get(System.getProperty("user.dir")).toAbsolutePath();
        while (cursor != null) {
            Path candidate = cursor.resolve(relative);
            if (Files.isRegularFile(candidate)) {
                return new String(Files.readAllBytes(candidate), StandardCharsets.UTF_8);
            }
            cursor = cursor.getParent();
        }
        throw new IOException("repository_contract_missing:" + relative);
    }

    private static byte[] hex(String value) {
        byte[] result = new byte[value.length() / 2];
        for (int index = 0; index < result.length; index++) {
            result[index] = (byte) Integer.parseInt(value.substring(index * 2, index * 2 + 2), 16);
        }
        return result;
    }
}
