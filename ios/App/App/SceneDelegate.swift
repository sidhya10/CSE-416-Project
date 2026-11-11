import UIKit
import Capacitor
import GoogleSignIn

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = DivvyBridgeViewController()
        window?.makeKeyAndVisible()

        for context in connectionOptions.urlContexts { _ = GIDSignIn.sharedInstance.handle(context.url) }
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        let remaining = Set(URLContexts.filter { !GIDSignIn.sharedInstance.handle($0.url) })
        if !remaining.isEmpty { SceneDelegateProxy.shared.scene(scene, openURLContexts: remaining) }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
