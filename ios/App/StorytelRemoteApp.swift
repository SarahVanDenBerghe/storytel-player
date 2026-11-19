import ActivityKit
import SwiftUI

@main
struct StorytelRemoteApp: App {
    var body: some Scene {
        WindowGroup { ContentView() }
    }
}

struct ContentView: View {
    @AppStorage(MacRemote.addressKey) private var address = ""
    @State private var running = !Activity<RemoteAttributes>.activities.isEmpty
    @State private var problem: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("My-Mac.local:47820", text: $address)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("Mac address")
                } footer: {
                    Text("The Mac's name (System Settings → General → Sharing) followed by :47820, or its IP address.")
                }
                Section {
                    Button(running ? "Stop Lock Screen controls" : "Start Lock Screen controls") {
                        Task { await toggleCard() }
                    }
                } footer: {
                    if let problem { Text(problem).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Storytel Remote")
        }
    }

    private func toggleCard() async {
        problem = nil
        if running {
            for activity in Activity<RemoteAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            running = false
            return
        }
        do {
            // Reaching the Mac here, in the foreground, also triggers the Local
            // Network permission prompt that the Lock Screen buttons depend on.
            let state = try await MacRemote.status()
            _ = try Activity.request(attributes: RemoteAttributes(), content: .init(state: state, staleDate: nil))
            running = true
        } catch {
            problem = "Couldn't reach the Mac. Is Storytel Companion open and the Mac on the same Wi-Fi? (\(error.localizedDescription))"
        }
    }
}
