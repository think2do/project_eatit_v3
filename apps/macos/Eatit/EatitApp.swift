import SwiftUI
import AppKit

@main
struct EatitApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    var body: some Scene {
        WindowGroup {
            WebViewContainer()
                .frame(minWidth: 1000, minHeight: 700)
        }
        .windowStyle(.titleBar)
        .commands { /* 后续节点添加菜单 */ }
    }
}

struct WebViewContainer: NSViewControllerRepresentable {
    func makeNSViewController(context: Context) -> WebViewController { WebViewController() }
    func updateNSViewController(_: WebViewController, context: Context) {}
}
