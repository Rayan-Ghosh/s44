package com.avaran.security.telemetry

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log

/**
 * Continuous on-device speech transcription using Android's built-in
 * [SpeechRecognizer] — free, no API key, ships with every Android phone
 * (backed by Google Speech Services). This exists because the Bhashini-based
 * path (`main.py` → BHASHINI_API_KEY) has no working credentials configured;
 * this is the real-world substitute so live-call scam detection actually
 * works without an external STT provider.
 *
 * [SpeechRecognizer] is not a true streaming API: each call to
 * [start] listens for one utterance (until a pause) and delivers it via
 * [onTranscript], then this class automatically restarts listening —
 * giving effectively-continuous transcription across a call, at the cost
 * of per-utterance (not per-word) latency.
 *
 * Must be constructed and driven from a thread with a [android.os.Looper]
 * (the service's main thread) — SpeechRecognizer requires this.
 */
class OnDeviceSpeechRecognizer(
    private val context: Context,
    private val onTranscript: (String) -> Unit,
    private val onListeningStateChanged: (Boolean) -> Unit = {},
) {
    private var recognizer: SpeechRecognizer? = null
    private var shouldKeepListening = false

    fun isAvailable(): Boolean = SpeechRecognizer.isRecognitionAvailable(context)

    fun start() {
        if (!isAvailable()) {
            Log.w(TAG, "SpeechRecognizer unavailable on this device")
            return
        }
        if (recognizer != null) return // already running

        shouldKeepListening = true
        val sr = SpeechRecognizer.createSpeechRecognizer(context)
        sr.setRecognitionListener(listener)
        recognizer = sr
        listenOnce()
    }

    fun stop() {
        shouldKeepListening = false
        recognizer?.let {
            it.setRecognitionListener(null)
            it.destroy()
        }
        recognizer = null
        onListeningStateChanged(false)
    }

    private fun listenOnce() {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
            // Scam calls in India are frequently bilingual/code-switched;
            // free-form + device default locale is the honest choice here
            // rather than hardcoding "en-IN" and silently mistranscribing
            // Hindi/Hinglish segments.
        }
        try {
            recognizer?.startListening(intent)
        } catch (e: Exception) {
            Log.w(TAG, "startListening failed: ${e.message}")
        }
    }

    private val listener = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {
            onListeningStateChanged(true)
        }

        override fun onResults(results: Bundle) {
            val matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            val best = matches?.firstOrNull()
            if (!best.isNullOrBlank()) {
                onTranscript(best)
            }
            restartIfNeeded()
        }

        override fun onError(error: Int) {
            // ERROR_NO_MATCH / ERROR_SPEECH_TIMEOUT are routine during
            // silence — not failures, just "nothing said yet". Logging the
            // code either way: a real device-in-call mic restriction shows
            // up here as a *specific*, consistent code (commonly
            // ERROR_AUDIO=3 or ERROR_NO_MATCH=7 firing on every single
            // cycle with literally zero speech ever detected), which is
            // the evidence needed to confirm vs. rule that out rather than
            // guess at it.
            Log.w(TAG, "onError: ${errorName(error)} ($error)")
            restartIfNeeded()
        }

        override fun onPartialResults(partialResults: Bundle) {
            val text = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
            if (!text.isNullOrBlank()) Log.i(TAG, "partial: $text")
        }

        override fun onEndOfSpeech() {
            Log.i(TAG, "onEndOfSpeech (speech segment detected and closed)")
            onListeningStateChanged(false)
        }

        override fun onBeginningOfSpeech() {
            Log.i(TAG, "onBeginningOfSpeech (mic detected speech starting)")
        }

        // Diagnostic only: proves whether the mic is receiving audio energy
        // at all. A value that never rises above the ~ -2 baseline while
        // someone is actively talking means audio isn't reaching the
        // recognizer; a value that visibly rises means it is, and the
        // failure is purely in transcription confidence, not input.
        private var lastLoggedRms = Float.MIN_VALUE
        override fun onRmsChanged(rmsdB: Float) {
            if (kotlin.math.abs(rmsdB - lastLoggedRms) >= 2f) {
                Log.d(TAG, "rms: $rmsdB dB")
                lastLoggedRms = rmsdB
            }
        }

        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEvent(eventType: Int, params: Bundle?) {}
    }

    private fun restartIfNeeded() {
        if (shouldKeepListening) {
            listenOnce()
        }
    }

    private fun errorName(code: Int): String = when (code) {
        SpeechRecognizer.ERROR_AUDIO -> "ERROR_AUDIO"
        SpeechRecognizer.ERROR_CLIENT -> "ERROR_CLIENT"
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "ERROR_INSUFFICIENT_PERMISSIONS"
        SpeechRecognizer.ERROR_NETWORK -> "ERROR_NETWORK"
        SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "ERROR_NETWORK_TIMEOUT"
        SpeechRecognizer.ERROR_NO_MATCH -> "ERROR_NO_MATCH"
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "ERROR_RECOGNIZER_BUSY"
        SpeechRecognizer.ERROR_SERVER -> "ERROR_SERVER"
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "ERROR_SPEECH_TIMEOUT"
        else -> "UNKNOWN"
    }

    companion object {
        private const val TAG = "OnDeviceSpeechRecognizer"
    }
}
