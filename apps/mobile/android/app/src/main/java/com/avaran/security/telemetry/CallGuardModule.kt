package com.avaran.security.telemetry

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Bridges the RN "Detect Current Call" / "Hang Up" buttons (VoiceScreen) to
 * [LiveCallAudioService]'s real on-device speech detection. Deliberately a
 * manual, user-initiated start/stop rather than fully automatic: live
 * device testing confirmed [android.speech.SpeechRecognizer] only gets
 * genuine microphone access when the app is foregrounded, not from a
 * background-only foreground Service — so this only ever gets called while
 * the user has the app open on screen, which is exactly the condition it
 * needs.
 */
class CallGuardModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "CallGuardModule"

    @ReactMethod
    fun startDetection(promise: Promise) {
        val context = reactApplicationContext
        val hasRecordAudio = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED

        if (!hasRecordAudio) {
            promise.reject("PERMISSION_DENIED", "Microphone permission is required to detect a live call.")
            return
        }

        try {
            val intent = Intent(context, LiveCallAudioService::class.java).apply {
                action = LiveCallAudioService.ACTION_START_DETECTION
            }
            ContextCompat.startForegroundService(context, intent)
            promise.resolve(true)
        } catch (e: Exception) {
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
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_FAILED", e.message, e)
        }
    }
}
