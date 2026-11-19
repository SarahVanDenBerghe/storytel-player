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
        // Each button fills a quarter of the row, so a tap near an icon still
        // hits the button instead of the card (which opens the app, and so asks
        // for an unlock).
        HStack(spacing: 0) {
            Button(intent: BackIntent()) { target(Image(systemName: "gobackward.15")) }
            Button(intent: PlayPauseIntent()) { target(Image(systemName: "playpause.fill")) }
            Button(intent: ForwardIntent()) { target(Image(systemName: "goforward.15")) }
            Button(intent: NextSpeedIntent()) { target(Text(speedLabel(state.rate)).monospacedDigit()) }
        }
        .font(.title2)
        .buttonStyle(.plain)
    }

    private func target(_ label: some View) -> some View {
        label.frame(maxWidth: .infinity, minHeight: 44).contentShape(Rectangle())
    }
}

/// The companion app's title serif (Tailwind `font-serif`: Charter), which iOS ships.
private let titleFont = Font.custom("Charter", size: 17, relativeTo: .headline).weight(.semibold)

private func speedLabel(_ rate: Double) -> String {
    rate.formatted(.number.precision(.fractionLength(0...2))) + "×"
}
