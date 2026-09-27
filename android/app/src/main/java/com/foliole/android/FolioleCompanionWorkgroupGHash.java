package com.foliole.android;

import java.util.Arrays;

final class FolioleCompanionWorkgroupGHash {
    private static final int BLOCK_BYTES = 16;
    private final byte[][][] products = new byte[BLOCK_BYTES][256][];
    private final byte[] state = new byte[BLOCK_BYTES];
    private final byte[] scratch = new byte[BLOCK_BYTES];
    private final byte[] pending = new byte[BLOCK_BYTES];
    private int pendingLength;
    private long aadLength;
    private long ciphertextLength;

    FolioleCompanionWorkgroupGHash(byte[] hashSubkey, byte[] aad) {
        if (hashSubkey.length != BLOCK_BYTES) throw new IllegalArgumentException("Invalid GCM subkey");
        for (int position = 0; position < BLOCK_BYTES; position++) {
            for (int value = 0; value < 256; value++) {
                byte[] basis = new byte[BLOCK_BYTES];
                basis[position] = (byte) value;
                products[position][value] = multiply(basis, hashSubkey);
            }
        }
        aadLength = aad.length;
        update(aad, 0, aad.length);
        pad();
    }

    void updateCiphertext(byte[] bytes, int count) {
        ciphertextLength += count;
        update(bytes, 0, count);
    }

    byte[] finish() {
        pad();
        byte[] lengths = new byte[BLOCK_BYTES];
        writeLong(lengths, 0, aadLength * 8);
        writeLong(lengths, 8, ciphertextLength * 8);
        accept(lengths);
        return state.clone();
    }

    private void update(byte[] bytes, int offset, int count) {
        for (int index = 0; index < count; index++) {
            pending[pendingLength++] = bytes[offset + index];
            if (pendingLength == BLOCK_BYTES) {
                accept(pending);
                pendingLength = 0;
            }
        }
    }

    private void pad() {
        if (pendingLength == 0) return;
        Arrays.fill(pending, pendingLength, BLOCK_BYTES, (byte) 0);
        accept(pending);
        pendingLength = 0;
    }

    private void accept(byte[] block) {
        Arrays.fill(scratch, (byte) 0);
        for (int position = 0; position < BLOCK_BYTES; position++) {
            byte[] product = products[position][(state[position] ^ block[position]) & 0xff];
            for (int index = 0; index < BLOCK_BYTES; index++) scratch[index] ^= product[index];
        }
        System.arraycopy(scratch, 0, state, 0, BLOCK_BYTES);
    }

    private static byte[] multiply(byte[] value, byte[] subkey) {
        byte[] result = new byte[BLOCK_BYTES];
        byte[] vector = subkey.clone();
        for (int bit = 0; bit < 128; bit++) {
            if ((value[bit / 8] & (0x80 >>> (bit % 8))) != 0) {
                for (int index = 0; index < BLOCK_BYTES; index++) result[index] ^= vector[index];
            }
            boolean low = (vector[BLOCK_BYTES - 1] & 1) != 0;
            for (int index = BLOCK_BYTES - 1; index > 0; index--) {
                vector[index] = (byte) (((vector[index] & 0xff) >>> 1) |
                    ((vector[index - 1] & 1) << 7));
            }
            vector[0] = (byte) ((vector[0] & 0xff) >>> 1);
            if (low) vector[0] ^= (byte) 0xe1;
        }
        return result;
    }

    private static void writeLong(byte[] bytes, int offset, long value) {
        for (int index = 7; index >= 0; index--) {
            bytes[offset + index] = (byte) value;
            value >>>= 8;
        }
    }
}
