package com.avaran.security.services

import android.accessibilityservice.AccessibilityService
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.avaran.security.net.RiskApiClient
import com.avaran.security.net.RiskEvaluationResult
import com.avaran.security.ui.FraudOverlayManager
import org.json.JSONObject
import java.security.MessageDigest
import java.util.UUID

/**
 * DEMO-ONLY PROOF OF CONCEPT — read this before enabling or distributing.
 *
 * This AccessibilityService reads the on-screen node tree of three third-party UPI
 * apps (Google Pay, PhonePe, Paytm) to detect when the user has reached a pre-PIN
 * payment-confirmation screen, so a risk score can be fetched and a warning shown
 * before the PIN is entered. Structurally, this is the same technique used by
 * screen-scraping/overlay banking malware, which is why:
 *
 *  - it is scoped via [UpiScreenClassifier.SUPPORTED_PACKAGES] / the accessibility
 *    service config XML to exactly the three named packages, nothing else;
 *  - it never reads or transmits amounts, recipient names, VPAs/UPI IDs, or any other
 *    node text as-is — [buildTelemetryPayload] sends only a coarse [UpiScreenSignal]
 *    enum plus package/session metadata (see docs/SECURITY.md §1–§3, non-PII);
 *  - it must never ship to real users / Play Store without: explicit onboarding
 *    consent UI, a persistent "AVARAN is watching payment screens" indicator while
 *    active, and a security/legal review — none of which exist yet.
 *
 * The risk fusion/decision itself happens entirely on the backend
 * (`POST /api/v1/transactions/evaluate`); this service is a signal producer only,
 * consistent with product directive §H (no on-device fraud "decision" authority).
 */
class PaymentScreenWatcherService : AccessibilityService() {

    private val apiClient = RiskApiClient()
    private val sessionId: String by lazy { UUID.randomUUID().toString() }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        event ?: return
        val packageName = event.packageName?.toString() ?: return
        if (packageName !in UpiScreenClassifier.SUPPORTED_PACKAGES) return

        if (event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED &&
            event.eventType != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
        ) {
            return
        }

        val root = rootInActiveWindow ?: return
        try {
            val texts = extractVisibleTexts(root)
            handleScreenSignal(packageName, UpiScreenClassifier.classify(packageName, texts))
        } finally {
            root.recycle()
        }
    }

    private fun handleScreenSignal(packageName: String, signal: UpiScreenSignal) {
        if (signal != UpiScreenSignal.PRE_PIN_PAYMENT) return

        val payload = buildTelemetryPayload(packageName)
        Log.d(TAG, "pre-PIN payment screen detected on $packageName, evaluating risk")

        apiClient.evaluateScreenTelemetry(payload) { result: RiskEvaluationResult ->
            val score = result.riskScore ?: return@evaluateScreenTelemetry
            if (score >= FraudOverlayManager.HIGH_RISK_THRESHOLD) {
                FraudOverlayManager.show(applicationContext, score, sessionId)
            }
        }
    }

    /**
     * Non-PII telemetry: deliberately excludes amount/recipient/VPA text scraped from
     * the screen. `device_id_hash` is a per-install pseudonymous salted hash, never the
     * raw ANDROID_ID, per docs/SECURITY.md §2.
     */
    private fun buildTelemetryPayload(packageName: String): JSONObject = JSONObject().apply {
        put("session_id", sessionId)
        put("package_name", packageName)
        put("screen_signal", UpiScreenSignal.PRE_PIN_PAYMENT.name)
        put("device_id_hash", hashedInstallId())
        put("client_timestamp_ms", System.currentTimeMillis())
        put("source", "payment_screen_watcher")
    }

    private fun hashedInstallId(): String {
        val raw = "${packageName}:$sessionId"
        val digest = MessageDigest.getInstance("SHA-256").digest(raw.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }
    }

    /** Walks the node tree collecting text/contentDescription, capped to avoid ANR on deep trees. */
    private fun extractVisibleTexts(node: AccessibilityNodeInfo, maxNodes: Int = 400): List<String> {
        val results = mutableListOf<String>()
        val stack = ArrayDeque<AccessibilityNodeInfo>()
        stack.addLast(node)
        var visited = 0

        while (stack.isNotEmpty() && visited < maxNodes) {
            val current = stack.removeLast()
            visited++
            current.text?.toString()?.let { if (it.isNotBlank()) results.add(it) }
            current.contentDescription?.toString()?.let { if (it.isNotBlank()) results.add(it) }
            for (i in 0 until current.childCount) {
                current.getChild(i)?.let { stack.addLast(it) }
            }
        }
        return results
    }

    override fun onInterrupt() {
        Log.w(TAG, "PaymentScreenWatcherService interrupted")
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        Log.i(TAG, "PaymentScreenWatcherService connected (demo PoC scope: ${UpiScreenClassifier.SUPPORTED_PACKAGES})")
    }

    companion object {
        private const val TAG = "PaymentScreenWatcher"
    }
}
