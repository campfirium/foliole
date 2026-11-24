package com.foliole.android;

import org.junit.Test;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class FolioleCompanionWebDavHttpTest {
    @Test
    public void readsPropertiesOnlyForOneNamedPacketAtDepthZero() {
        String direction = "foliole-" + "a".repeat(64) + "-desktop/";
        String name = "20261111T120000.000Z-bf2ff771-4a86-420c-a871-3077d7c4e9a4";
        assertTrue(FolioleCompanionWebDavHttp.canReadPacketProperties(direction + name + ".asset.dat.partial", "0"));
        assertTrue(FolioleCompanionWebDavHttp.canReadPacketProperties(direction + name + ".repair.dat", "0"));
        assertFalse(FolioleCompanionWebDavHttp.canReadPacketProperties(direction + name + ".repair.bin", "0"));
        assertFalse(FolioleCompanionWebDavHttp.canReadPacketProperties(direction + name + ".repair.dat", "1"));
        assertFalse(FolioleCompanionWebDavHttp.canReadPacketProperties(direction + "../" + name + ".repair.dat", "0"));
        assertFalse(FolioleCompanionWebDavHttp.canReadPacketProperties(direction + name + ".other.dat", "0"));
    }

    @Test
    public void readsAndResumesLegacyPacketsWithinTheOwnedDirectory() {
        String direction = "foliole-" + "a".repeat(64) + "-desktop/";
        String stem = direction + "20261111T120000.000Z-bf2ff771-4a86-420c-a871-3077d7c4e9a4";
        for (String suffix : new String[] {".bin", ".asset.bin", ".repair.bin"}) {
            assertTrue(FolioleCompanionWebDavHttp.canTransferPacket(stem + suffix, false));
            assertTrue(FolioleCompanionWebDavHttp.canTransferPacket(stem + suffix + ".partial", true));
            assertFalse(FolioleCompanionWebDavHttp.canTransferPacket(stem + suffix, true));
        }
        assertTrue(FolioleCompanionWebDavHttp.canReadPacketProperties(stem + ".asset.bin", "0"));
        assertTrue(FolioleCompanionWebDavHttp.canReadPacketProperties(stem + ".asset.bin.partial", "0"));
        assertFalse(FolioleCompanionWebDavHttp.canReadPacketProperties(stem + ".asset.bin", "1"));
        assertFalse(FolioleCompanionWebDavHttp.canTransferPacket("other/" + stem + ".bin", false));
    }

    @Test
    public void deleteAcceptsOnlyOneOwnedCollection() {
        String direction = "foliole-" + "a".repeat(64) + "-desktop";
        String generation = "bf2ff771-4a86-420c-a871-3077d7c4e9a4";
        assertTrue(FolioleCompanionWebDavHttp.isDeletableCollection(direction + "/"));
        assertTrue(FolioleCompanionWebDavHttp.isDeletableCollection(direction + "-collections/" + generation + "/"));
        assertFalse(FolioleCompanionWebDavHttp.isDeletableCollection(""));
        assertFalse(FolioleCompanionWebDavHttp.isDeletableCollection(direction + "-collections/"));
        assertFalse(FolioleCompanionWebDavHttp.isDeletableCollection(direction + "-collections/../"));
        assertFalse(FolioleCompanionWebDavHttp.isDeletableCollection(direction + "-collections/" + generation + "/file.dat"));
    }
}
