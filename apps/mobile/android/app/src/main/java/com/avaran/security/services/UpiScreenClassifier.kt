package com.avaran.security.services

/** Structural signal extracted from a UPI app's on-screen node tree. No amounts,
 * recipient names, VPAs, or other transaction content are ever part of this enum —
 * that's the "non-PII" boundary this PoC holds itself to. */
enum class UpiScreenSignal {
    NONE,
    PRE_PIN_PAYMENT,
    PIN_ENTRY,
}

/**
 * Heuristic classifier for "which stage of a UPI payment flow is this screen".
 *
 * This is a demo-grade PoC, not a production screen classifier: it pattern-matches on
 * visible text and resource-id fragments, which is inherently brittle against app
 * updates, A/B UI variants, and localization. A production build would need a
 * per-app-version calibrated model or an app-provided integration instead of
 * screen-scraping heuristics — see docs/SECURITY.md for the policy caveats.
 *
 * Kept dependency-free (no android.* imports) so it can run as a plain JVM unit test.
 */
object UpiScreenClassifier {

    val SUPPORTED_PACKAGES: Set<String> = setOf(
        "com.google.android.apps.nbu.paisa.user", // Google Pay
        "com.phonepe.app",                        // PhonePe
        "net.one97.paytm",                        // Paytm
    )

    private val PIN_ENTRY_MARKERS = listOf(
        "enter upi pin", "enter your upi pin", "enter pin", "upi pin", "mpin",
    )

    private val PAYMENT_CONFIRM_MARKERS = listOf(
        "pay ", "proceed to pay", "confirm payment", "review payment", "send money", "swipe to pay",
    )

    /**
     * @param packageName the foreground app's package, from AccessibilityEvent.packageName
     * @param screenTexts visible on-screen text nodes (already lowercased upstream is NOT
     *   assumed — this function normalizes case itself)
     */
    fun classify(packageName: String, screenTexts: List<String>): UpiScreenSignal {
        if (packageName !in SUPPORTED_PACKAGES) return UpiScreenSignal.NONE
        if (screenTexts.isEmpty()) return UpiScreenSignal.NONE

        val normalized = screenTexts.map { it.trim().lowercase() }.filter { it.isNotEmpty() }

        val looksLikePinEntry = normalized.any { text -> PIN_ENTRY_MARKERS.any { text.contains(it) } }
        if (looksLikePinEntry) return UpiScreenSignal.PIN_ENTRY

        val looksLikePaymentConfirm = normalized.any { text -> PAYMENT_CONFIRM_MARKERS.any { text.contains(it) } }
        if (looksLikePaymentConfirm) return UpiScreenSignal.PRE_PIN_PAYMENT

        return UpiScreenSignal.NONE
    }
}
