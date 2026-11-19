import ActivityKit
import Foundation

/// What the Lock Screen card shows. `ContentState` matches the Mac's GET /status reply.
struct RemoteAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var title: String?
        var playing: Bool
        var rate: Double
    }
}

/// Talks to the remote listener in the Mac app (src/modules/remote.ts).
enum MacRemote {
    /// Host and port of the Mac, e.g. "My-Mac.local:47820", typed in the app.
    static let addressKey = "macAddress"
    static let speeds: [Double] = [1, 1.25, 1.5, 1.75, 2]

    // Short timeouts: a sleeping Mac must not leave a button hanging.
    private static let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 3
        config.timeoutIntervalForResource = 3
        return URLSession(configuration: config)
    }()

    private static func url(_ path: String) throws -> URL {
        let address = UserDefaults.standard.string(forKey: addressKey) ?? ""
        guard !address.isEmpty, let url = URL(string: "http://\(address)\(path)") else { throw URLError(.badURL) }
        return url
    }

    static func status() async throws -> RemoteAttributes.ContentState {
        let (data, response) = try await session.data(from: url("/status"))
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
        return try JSONDecoder().decode(RemoteAttributes.ContentState.self, from: data)
    }

    /// Sends a command, then refreshes the Lock Screen card with the new state.
    static func send(_ path: String) async throws {
        var request = URLRequest(url: try url(path))
        request.httpMethod = "POST"
        let (_, response) = try await session.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 204 else { throw URLError(.badServerResponse) }
        try? await Task.sleep(for: .milliseconds(400)) // let the player apply it
        await refreshCard()
    }

    static func refreshCard() async {
        guard let state = try? await status() else { return }
        for activity in Activity<RemoteAttributes>.activities {
            await activity.update(ActivityContent(state: state, staleDate: nil))
        }
    }
}
