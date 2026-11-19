import AppIntents

// The Lock Screen card's buttons. As LiveActivityIntents they run in the app's
// process, and `alwaysAllowed` lets them run while the phone is locked.

struct BackIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Back 15 seconds"
    static let authenticationPolicy: IntentAuthenticationPolicy = .alwaysAllowed
    func perform() async throws -> some IntentResult {
        try await MacRemote.send("/back")
        return .result()
    }
}

struct PlayPauseIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Play or pause"
    static let authenticationPolicy: IntentAuthenticationPolicy = .alwaysAllowed
    func perform() async throws -> some IntentResult {
        try await MacRemote.send("/play-pause")
        return .result()
    }
}

struct ForwardIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Forward 15 seconds"
    static let authenticationPolicy: IntentAuthenticationPolicy = .alwaysAllowed
    func perform() async throws -> some IntentResult {
        try await MacRemote.send("/forward")
        return .result()
    }
}

/// Steps to the next speed in `MacRemote.speeds`, from the Mac's current speed.
struct NextSpeedIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Next speed"
    static let authenticationPolicy: IntentAuthenticationPolicy = .alwaysAllowed
    func perform() async throws -> some IntentResult {
        let current = try await MacRemote.status().rate
        let next = MacRemote.speeds.first { $0 > current + 0.01 } ?? MacRemote.speeds[0]
        try await MacRemote.send("/speed/\(next)")
        return .result()
    }
}
