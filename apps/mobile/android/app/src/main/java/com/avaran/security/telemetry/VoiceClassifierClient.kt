package com.avaran.security.telemetry

import android.util.Log
import com.avaran.security.config.DevConfig
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** One classification response from apps/api's real voice-scam classifier. */
data class VoiceClassification(
    val accumulatedRisk: Double,
    val coercionLevel: String, // "SAFE" | "ELEVATED" | "CRITICAL"
    val detectedIntents: List<String>,
    val matchedPhrases: List<String>,
    val isScamAlert: Boolean,
    val message: String,
)

/**
 * Streams transcript text chunks to apps/api's `/ws/voice-stream` — the
 * same real, ML-backed classifier already verified working from the mobile
 * app's own Voice Shield demo (docs/PROFILE_CONTACT_INFO_DECISION.md's
 * sibling verification pass). One socket per call; the backend keeps a
 * stateful leaky-bucket risk accumulator per connection, so risk genuinely
 * builds up across utterances the way it would for a real scam call.
 */
class VoiceClassifierClient(
    private val onClassification: (VoiceClassification) -> Unit,
) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS) // WS stays open indefinitely
        .build()

    private var socket: WebSocket? = null

    fun connect() {
        if (socket != null) return
        val request = Request.Builder().url(DevConfig.voiceStreamWsUrl()).build()
        socket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.i(TAG, "voice classifier connected")
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                parseAndDeliver(text)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.w(TAG, "voice classifier connection failed: ${t.message}")
                socket = null
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.i(TAG, "voice classifier closed: $reason")
                socket = null
            }
        })
    }

    fun sendTranscript(text: String) {
        if (text.isBlank()) return
        val payload = JSONObject().apply { put("text_chunk", text) }
        val sent = socket?.send(payload.toString()) ?: false
        if (!sent) {
            Log.w(TAG, "classifier socket not open; dropping transcript chunk")
        }
    }

    fun close() {
        socket?.close(1000, "call ended")
        socket = null
    }

    private fun parseAndDeliver(raw: String) {
        // Parsing and delivering the result are kept in separate try/catch
        // blocks deliberately: an exception thrown by onClassification's
        // callback (e.g. FraudOverlayManager failing to inflate its view)
        // must never be logged as a JSON parse failure — that mislabeling
        // cost real debugging time once already.
        val classification = try {
            val json = JSONObject(raw)
            val intents = mutableListOf<String>()
            json.optJSONArray("detected_intents")?.let { arr ->
                for (i in 0 until arr.length()) intents.add(arr.getString(i))
            }
            val phrases = mutableListOf<String>()
            json.optJSONArray("matched_phrases")?.let { arr ->
                for (i in 0 until arr.length()) phrases.add(arr.getString(i))
            }
            VoiceClassification(
                accumulatedRisk = json.optDouble("accumulated_risk", 0.0),
                coercionLevel = json.optString("coercion_level", "SAFE"),
                detectedIntents = intents,
                matchedPhrases = phrases,
                isScamAlert = json.optBoolean("is_scam_alert", false),
                message = json.optString("message", ""),
            )
        } catch (e: Exception) {
            Log.w(TAG, "failed to parse classifier response: ${e.message}")
            return
        }

        try {
            onClassification(classification)
        } catch (e: Exception) {
            Log.e(TAG, "onClassification callback threw", e)
        }
    }

    companion object {
        private const val TAG = "VoiceClassifierClient"
    }
}
