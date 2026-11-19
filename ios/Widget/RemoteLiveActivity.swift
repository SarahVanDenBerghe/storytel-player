import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

@main
struct RemoteWidgetBundle: WidgetBundle {
    var body: some Widget { RemoteLiveActivity() }
}

struct RemoteLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RemoteAttributes.self) { context in
            VStack(alignment: .leading, spacing: 10) {
                Text(context.state.title ?? "Storytel Companion")
                    .font(titleFont)
                    .lineLimit(1)
                Controls(state: context.state)
            }
            .padding()
            .activityBackgroundTint(.black)
            .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(context.state.title ?? "Storytel Companion").font(titleFont).lineLimit(1)
                        Controls(state: context.state)
                    }
                }
            } compactLeading: {
                Image(systemName: "headphones")
            } compactTrailing: {
                Text(speedLabel(context.state.rate)).font(.caption2)
            } minimal: {
                Image(systemName: "headphones")
            }
        }
    }
}

/// Back, play/pause, forward and speed. The play/pause icon does not depend on
/// the state, which can lag behind the Mac when playback changes there.
private struct Controls: View {
    let state: RemoteAttributes.ContentState

    var body: some View {
        HStack {
            Button(intent: BackIntent()) { Image(systemName: "gobackward.15") }
            Spacer()
            Button(intent: PlayPauseIntent()) { Image(systemName: "playpause.fill") }
            Spacer()
            Button(intent: ForwardIntent()) { Image(systemName: "goforward.15") }
            Spacer()
            Button(intent: NextSpeedIntent()) { Text(speedLabel(state.rate)).monospacedDigit() }
        }
        .font(.title2)
        .buttonStyle(.plain)
    }
}

/// The companion app's title serif (Tailwind `font-serif`: Charter), which iOS ships.
private let titleFont = Font.custom("Charter", size: 17, relativeTo: .headline).weight(.semibold)

private func speedLabel(_ rate: Double) -> String {
    rate.formatted(.number.precision(.fractionLength(0...2))) + "×"
}
