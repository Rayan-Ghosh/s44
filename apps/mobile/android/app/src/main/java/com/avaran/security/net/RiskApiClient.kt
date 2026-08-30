package com.avaran.security.net

import android.util.Log
import com.avaran.security.config.DevConfig
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Result of a `/transactions/evaluate` call. `riskScore` is null if the call failed. */
data class RiskEvaluationResult(
    val riskScore: Int?,
    val riskLevel: String?,
    val decision: String?,
)

/**
 * Thin OkHttp wrapper for the two network paths this module needs: posting the
 * non-PII screen-watcher telemetry payload, and opening the binary audio WebSocket.
 * Kept intentionally dependency-light (raw JSON, no Retrofit) since this is a demo PoC.
 */
class RiskApiClient(
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(4, TimeUnit.SECONDS)
        .readTimeout(4, TimeUnit.SECONDS)
        .build(),
) {
    companion object {
        private const val TAG = "RiskApiClient"
        private val JSON = "application/json; charset=utf-8".toMediaType()
    }

    fun okHttpClient(): OkHttpClient = client

    /**
     * Posts a non-PII telemetry payload and reports back the fused risk score.
     * Fails soft: network/parse errors resolve to [RiskEvaluationResult] with a null
     * score rather than throwing, since a demo PoC failing this call must never crash
     * the watcher service or block the user's real payment flow.
     */
    fun evaluateScreenTelemetry(payload: JSONObject, onResult: (RiskEvaluationResult) -> Unit) {
        val request = Request.Builder()
            .url(DevConfig.HTTP_BASE_URL + DevConfig.TRANSACTIONS_EVALUATE_PATH)
            .post(payload.toString().toRequestBody(JSON))
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.w(TAG, "risk evaluation call failed: ${e.message}")
                onResult(RiskEvaluationResult(null, null, null))
            }

            override fun onResponse(call: Call, response: Response) {
                response.use { resp ->
                    val body = resp.body?.string()
                    if (!resp.isSuccessful || body.isNullOrEmpty()) {
                        Log.w(TAG, "risk evaluation returned HTTP ${resp.code}")
                        onResult(RiskEvaluationResult(null, null, null))
                        return
                    }
                    try {
                        val json = JSONObject(body)
                        onResult(
                            RiskEvaluationResult(
                                riskScore = json.optInt("risk_score", -1).takeIf { it >= 0 },
                                riskLevel = json.optString("risk_level").takeIf { it.isNotEmpty() },
                                decision = json.optString("decision").takeIf { it.isNotEmpty() },
                            )
                        )
                    } catch (e: Exception) {
                        Log.w(TAG, "risk evaluation response parse failed: ${e.message}")
                        onResult(RiskEvaluationResult(null, null, null))
                    }
                }
            }
        })
    }
}
