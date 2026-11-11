import Capacitor

class DivvyBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(DivvyGoogleSignInPlugin())
    }
}
