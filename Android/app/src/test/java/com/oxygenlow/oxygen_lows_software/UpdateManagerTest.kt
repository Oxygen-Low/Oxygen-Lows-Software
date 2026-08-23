package com.oxygenlow.oxygen_lows_software

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdateManagerTest {

    @Test
    fun testIsNewerVersion_HigherPatchReturnsTrue() {
        assertTrue(UpdateManager.isNewerVersion("1.3.1", "1.3.0"))
    }

    @Test
    fun testIsNewerVersion_SameVersionReturnsFalse() {
        assertFalse(UpdateManager.isNewerVersion("1.3.0", "1.3.0"))
    }

    @Test
    fun testIsNewerVersion_LowerVersionReturnsFalse() {
        assertFalse(UpdateManager.isNewerVersion("1.3.0", "1.3.1"))
    }

    @Test
    fun testIsNewerVersion_HigherMinorReturnsTrue() {
        assertTrue(UpdateManager.isNewerVersion("1.4.0", "1.3.9"))
    }

    @Test
    fun testIsNewerVersion_TwoDigitPatchReturnsTrue() {
        assertTrue(UpdateManager.isNewerVersion("1.10.0", "1.9.5"))
    }

    @Test
    fun testIsNewerVersion_WithPrefixVReturnsTrue() {
        assertTrue(UpdateManager.isNewerVersion("v1.3.1", "1.3.0"))
        assertTrue(UpdateManager.isNewerVersion("v2.0.0", "v1.9.9"))
    }

    @Test
    fun testIsNewerVersion_ExtraSubVersionReturnsTrue() {
        assertTrue(UpdateManager.isNewerVersion("1.3.0.1", "1.3.0"))
        assertFalse(UpdateManager.isNewerVersion("1.3.0", "1.3.0.1"))
    }

    @Test
    fun testIsNewerVersion_InvalidStringsReturnFalseGracefully() {
        assertFalse(UpdateManager.isNewerVersion("invalid", "1.0"))
        assertFalse(UpdateManager.isNewerVersion("", ""))
    }
}
