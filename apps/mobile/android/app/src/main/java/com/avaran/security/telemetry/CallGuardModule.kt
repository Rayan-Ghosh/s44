package com.avaran.security.telemetry

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Bridges the RN "Detect Current Call" / "Hang Up" buttons (VoiceScreen) to
 * [LiveCallAudioService]'s real on-device speech detection. Deliberately a
 * manual, user-initiated start/stop rather than fully automatic: live
 * device testing confirmed [android.speech.SpeechRecognizer] only gets
 * genuine microphone access when the app is foregrounded, not from a
 * background-only foreground Service — so this only ever gets called while
 * the user has the app open on screen, which is exactly the condition it
 * needs.
 *
 * Emits typed call-audio lifecycle events to React Native via NativeEventEmitter
 * and RCTDeviceEventEmitter:
 * - call_started / call_stopped
 * - audio_capture_started / audio_capture_stopped
 * - audio_capture_unavailable / audio_capture_error
 * - audio_buffer_ready (metadata only, no raw audio)
 */
class CallGuardModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    init {
        instance = this
    }

    override fun getName(): String = "CallGuardModule"

    override fun invalidate() {
        if (instance === this) {
            instance = null
        }
        super.invalidate()
    }

    // Required for React Native NativeEventEmitter
    @ReactMethod
    fun addListener(eventName: String) {
        // Keep: Required for RN built-in Event Emitter Calls.
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Keep: Required for RN built-in Event Emitter Calls.
    }

    @ReactMethod
    fun startDetection(promise: Promise) {
        val context = reactApplicationContext
        val hasRecordAudio = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED

        if (!hasRecordAudio) {
            emit(
                EVENT_AUDIO_CAPTURE_UNAVAILABLE,
                errorCode = "PERMISSION_DENIED",
                error = "Microphone permission is required to detect a live call."
            )
            promise.reject("PERMISSION_DENIED", "Microphone permission is required to detect a live call.")
            return
        }

        try {
            val intent = Intent(context, LiveCallAudioService::class.java).apply {
                action = LiveCallAudioService.ACTION_START_DETECTION
            }
            ContextCompat.startForegroundService(context, intent)
            emit(EVENT_CALL_STARTED)
            promise.resolve(true)
        } catch (e: Exception) {
            emit(
                EVENT_AUDIO_CAPTURE_ERROR,
                errorCode = "START_FAILED",
                error = e.message ?: "Failed to start call detection"
            )
            promise.reject("START_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun stopDetection(promise: Promise) {
        val context = reactApplicationContext
        try {
            val intent = Intent(context, LiveCallAudioService::class.java).apply {
                action = LiveCallAudioService.ACTION_STOP_DETECTION
            }
            ContextCompat.startForegroundService(context, intent)
            emit(EVENT_CALL_STOPPED)
            promise.resolve(true)
        } catch (e: Exception) {
            emit(
                EVENT_AUDIO_CAPTURE_ERROR,
                errorCode = "STOP_FAILED",
                error = e.message ?: "Failed to stop call detection"
            )
            promise.reject("STOP_FAILED", e.message, e)
        }
    }

    private fun emitEvent(eventName: String, params: WritableMap?) {
        try {
            if (reactApplicationContext.hasActiveReactInstance()) {
                val emitter = reactApplicationContext.getJSModule(
                    DeviceEventManagerModule.RCTDeviceEventEmitter::class.java
                )
                emitter?.emit(eventName, params)
                emitter?.emit(CALL_GUARD_EVENT, params)
            }
        } catch (e: Exception) {
            // Guard against race conditions when bridge is unmounting
        }
    }

    companion object {
        @Volatile
        private var instance: CallGuardModule? = null

        const val CALL_GUARD_EVENT = "CallGuardEvent"
        const val EVENT_CALL_STARTED = "call_started"
        const val EVENT_CALL_STOPPED = "call_stopped"
        const val EVENT_AUDIO_CAPTURE_STARTED = "audio_capture_started"
        const val EVENT_AUDIO_CAPTURE_STOPPED = "audio_capture_stopped"
        const val EVENT_AUDIO_CAPTURE_UNAVAILABLE = "audio_capture_unavailable"
        const val EVENT_AUDIO_CAPTURE_ERROR = "audio_capture_error"
        const val EVENT_AUDIO_BUFFER_READY = "audio_buffer_ready"

        /**
         * Emits a typed CallGuard event to JavaScript.
         * Only transmits non-sensitive metadata (type, timestamp, sessionId, errorCode/error, bufferSize, audio parameters).
         * Strictly rejects invalid or malformed audio buffer metadata and never includes raw PCM samples.
         */
        fun emit(
            eventName: String,
            sessionId: String? = null,
            errorCode: String? = null,
            error: String? = null,
            bufferSize: Int? = null,
            sampleRateHz: Int? = null,
            channelCount: Int? = null,
            audioFormat: String? = null,
            durationMs: Double? = null,
            source: String? = null
        ) {
            val current = instance ?: return

            // Native safety: validate audio buffer metadata before emitting
            if (eventName == EVENT_AUDIO_BUFFER_READY) {
                if (bufferSize == null || bufferSize <= 0 || bufferSize > 10_000_000) {
                    return // Reject invalid or oversized buffer
                }
                if (sampleRateHz != null && (sampleRateHz < 8000 || sampleRateHz > 192000)) {
                    return // Reject invalid sample rate
                }
                if (durationMs != null && (durationMs < 0.0 || durationMs.isNaN() || durationMs.isInfinite())) {
                    return // Reject invalid duration
                }
            }

            try {
                val map = Arguments.createMap().apply {
                    putString("type", eventName)
                    putDouble("timestamp", System.currentTimeMillis().toDouble())
                    sessionId?.let { putString("sessionId", it) }
                    errorCode?.let { putString("errorCode", it) }
                    error?.let { putString("error", it) }
                    bufferSize?.let { putInt("bufferSize", it) }
                    sampleRateHz?.let { putInt("sampleRateHz", it) }
                    channelCount?.let { putInt("channelCount", it) }
                    audioFormat?.let { putString("audioFormat", it) }
                    durationMs?.let { putDouble("durationMs", it) }
                    source?.let { putString("source", it) }
                }
                current.emitEvent(eventName, map)
            } catch (e: Exception) {
                // Defensive fallback: prevent any exception from affecting the service
            }
        }
    }
}

