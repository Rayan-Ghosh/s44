package com.avaran.security.services

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Simulates screen-state transition events (as an AccessibilityService would observe
 * them) by feeding [UpiScreenClassifier] the package name + extracted node texts for
 * each stage of a mock UPI payment flow. Pure-Kotlin/JVM test, no Android framework or
 * Robolectric needed since the classifier has no android.* dependency.
 */
class UpiScreenClassifierTest {

    private val gpay = "com.google.android.apps.nbu.paisa.user"
    private val phonepe = "com.phonepe.app"
    private val paytm = "net.one97.paytm"
    private val unrelatedApp = "com.instagram.android"

    @Test
    fun `home screen of a supported UPI app produces no signal`() {
        val texts = listOf("Home", "Scan & Pay", "Bank transfer")
        assertEquals(UpiScreenSignal.NONE, UpiScreenClassifier.classify(gpay, texts))
    }

    @Test
    fun `pre-PIN payment confirmation screen is detected on Google Pay`() {
        val texts = listOf("Paying ₹500", "To: Ramesh Kumar", "Proceed to Pay", "Add a note")
        assertEquals(UpiScreenSignal.PRE_PIN_PAYMENT, UpiScreenClassifier.classify(gpay, texts))
    }

    @Test
    fun `pre-PIN payment confirmation screen is detected on PhonePe`() {
        val texts = listOf("Pay ₹1,200", "Swipe to Pay", "Cancel")
        assertEquals(UpiScreenSignal.PRE_PIN_PAYMENT, UpiScreenClassifier.classify(phonepe, texts))
    }

    @Test
    fun `PIN entry screen takes priority over payment-confirm markers on Paytm`() {
        val texts = listOf("Confirm Payment", "Enter UPI PIN", "1", "2", "3")
        assertEquals(UpiScreenSignal.PIN_ENTRY, UpiScreenClassifier.classify(paytm, texts))
    }

    @Test
    fun `unsupported app package is always ignored regardless of screen text`() {
        val texts = listOf("Enter UPI PIN", "Proceed to Pay")
        assertEquals(UpiScreenSignal.NONE, UpiScreenClassifier.classify(unrelatedApp, texts))
    }

    @Test
    fun `empty screen text (transition frame with no rendered nodes yet) yields no signal`() {
        assertEquals(UpiScreenSignal.NONE, UpiScreenClassifier.classify(gpay, emptyList()))
    }

    @Test
    fun `classification is case-insensitive and tolerates whitespace`() {
        val texts = listOf("  ENTER YOUR UPI PIN  ")
        assertEquals(UpiScreenSignal.PIN_ENTRY, UpiScreenClassifier.classify(phonepe, texts))
    }

    @Test
    fun `simulated screen-state transition sequence - home to pay to PIN`() {
        // Simulates three consecutive TYPE_WINDOW_STATE_CHANGED events for one payment.
        val transitions = listOf(
            listOf("Home", "Scan & Pay") to UpiScreenSignal.NONE,
            listOf("Paying ₹2,000", "To: Sunita Verma", "Pay ₹2,000") to UpiScreenSignal.PRE_PIN_PAYMENT,
            listOf("Enter UPI PIN", "●●●●") to UpiScreenSignal.PIN_ENTRY,
        )

        transitions.forEach { (texts, expected) ->
            assertEquals(expected, UpiScreenClassifier.classify(gpay, texts))
        }
    }
}
