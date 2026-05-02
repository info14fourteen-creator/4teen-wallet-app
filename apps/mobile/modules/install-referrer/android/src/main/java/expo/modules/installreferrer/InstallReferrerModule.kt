package expo.modules.installreferrer

import com.android.installreferrer.api.InstallReferrerClient
import com.android.installreferrer.api.InstallReferrerStateListener
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class InstallReferrerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FourteenInstallReferrer")

    AsyncFunction("getInstallReferrerAsync") { promise: Promise ->
      val reactContext = appContext.reactContext
      if (reactContext == null) {
        promise.resolve(null)
        return@AsyncFunction
      }

      val client = InstallReferrerClient.newBuilder(reactContext).build()
      var settled = false

      fun finish(payload: Map<String, Any?>?) {
        if (settled) {
          return
        }

        settled = true
        if (payload == null) {
          promise.resolve(null)
        } else {
          promise.resolve(payload)
        }
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
