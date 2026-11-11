import Capacitor
import GoogleSignIn
import UIKit
import WebKit

@objc(DivvyGoogleSignInPlugin)
public class DivvyGoogleSignInPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DivvyGoogleSignInPlugin"
    public let jsName = "DivvyGoogleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise)]
    private var inProgress = false

    @objc func signIn(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard !self.inProgress else { call.reject("Google sign-in is already open.", "GOOGLE_BUSY"); return }
            guard let origin = self.bridge?.webView?.url,
                  (origin.scheme == "https" && origin.host == "cse-416-project-tau.vercel.app" && (origin.port == nil || origin.port == 443)) ||
                  (origin.scheme == "capacitor" && origin.host == "localhost") else {
                call.reject("Google sign-in is not available on this page.", "GOOGLE_ORIGIN"); return
            }
            guard let clientId = Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String,
                  clientId.range(of: #"^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$"#, options: .regularExpression) != nil else {
                call.reject("Google sign-in is not configured for this iOS app yet. Sign in with a password.", "GOOGLE_NOT_CONFIGURED"); return
            }
            let scheme = clientId.components(separatedBy: ".").reversed().joined(separator: ".")
            let types = Bundle.main.object(forInfoDictionaryKey: "CFBundleURLTypes") as? [[String: Any]] ?? []
            guard types.contains(where: { ($0["CFBundleURLSchemes"] as? [String] ?? []).contains(scheme) }),
                  let serverId = call.getString("serverClientId"), serverId.hasSuffix(".apps.googleusercontent.com"),
                  let nonce = call.getString("nonce"), nonce.range(of: #"^[A-Za-z0-9_-]{32,128}$"#, options: .regularExpression) != nil,
                  let presenter = self.bridge?.viewController else {
                call.reject("Google sign-in configuration is incomplete. Sign in with a password.", "GOOGLE_NOT_CONFIGURED"); return
            }
            self.inProgress = true
            GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientId, serverClientID: serverId)
            GIDSignIn.sharedInstance.signOut()
            GIDSignIn.sharedInstance.signIn(withPresenting: presenter, hint: nil, additionalScopes: nil, nonce: nonce) { result, error in
                self.inProgress = false
                if let error = error as NSError? {
                    let cancelled = error.domain == kGIDSignInErrorDomain && error.code == GIDSignInError.Code.canceled.rawValue
                    call.reject(cancelled ? "Google sign-in was cancelled." : "Google sign-in could not finish. Please try again.", cancelled ? "GOOGLE_CANCELLED" : "GOOGLE_FAILED")
                    return
                }
                guard let token = result?.user.idToken?.tokenString, !token.isEmpty else {
                    call.reject("Google did not return a sign-in credential. Please try again.", "GOOGLE_NO_TOKEN"); return
                }
                // Divvy owns the app session. Do not retain Google API tokens or request offline access.
                GIDSignIn.sharedInstance.signOut()
                call.resolve(["idToken": token])
            }
        }
    }
}
