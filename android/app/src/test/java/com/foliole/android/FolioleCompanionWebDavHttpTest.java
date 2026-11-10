package com.foliole.android;

import org.junit.Test;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class FolioleCompanionWebDavHttpTest {
    @Test
    public void deleteAcceptsOnlyOneOwnedCollection() {
        String direction = "foliole-" + "a".repeat(64) + "-desktop";
        String generation = "bf2ff771-4a86-420c-a871-3077d7c4e9a4";
        assertTrue(FolioleCompanionWebDavHttp.isDeletableCollection(direction + "/"));
        assertTrue(FolioleCompanionWebDavHttp.isDeletableCollection(direction + "-collections/" + generation + "/"));
        assertFalse(FolioleCompanionWebDavHttp.isDeletableCollection(""));
        assertFalse(FolioleCompanionWebDavHttp.isDeletableCollection(direction + "-collections/"));
        assertFalse(FolioleCompanionWebDavHttp.isDeletableCollection(direction + "-collections/../"));
        assertFalse(FolioleCompanionWebDavHttp.isDeletableCollection(direction + "-collections/" + generation + "/file.bin"));
    }
}
