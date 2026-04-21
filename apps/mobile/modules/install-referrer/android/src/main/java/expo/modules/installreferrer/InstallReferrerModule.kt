package expo.modules.installreferrer

import com.android.installreferrer.api.InstallReferrerClient
import com.android.installreferrer.api.InstallReferrerStateListener
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

class InstallReferrerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FourteenInstallReferrer")

    AsyncFunction("getInstallReferrerAsync") Coroutine {
      val reactContext = appContext.reactContext ?: return@Coroutine null

      return@Coroutine suspendCancellableCoroutine { continuation ->
        val client = InstallReferrerClient.newBuilder(reactContext).build()
        var settled = false

        fun finish(payload: Map<String, Any?>?) {
          if (settled || !continuation.isActive) {
            return
          }

          settled = true
          continuation.resume(payload)
          runCatching { client.endConnection() }
        }

        continuation.invokeOnCancellation {
          runCatching { client.endConnection() }
        }

        client.startConnection(object : InstallReferrerStateListener {
          override fun onInstallReferrerSetupFinished(responseCode: Int) {
            if (responseCode != InstallReferrerClient.InstallReferrerResponse.OK) {
              finish(null)
              return
            }

            val response = runCatching { client.installReferrer }.getOrNull()
            if (response == null) {
              finish(null)
              return
            }

            finish(
              mapOf(
                "referrer" to response.installReferrer,
                "installBeginTimestampSeconds" to response.installBeginTimestampSeconds,
                "referrerClickTimestampSeconds" to response.referrerClickTimestampSeconds
              )
            )
          }

          override fun onInstallReferrerServiceDisconnected() {
            finish(null)
          }
        })
      }
    }
  }
}
