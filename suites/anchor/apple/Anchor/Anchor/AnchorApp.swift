//
//  AnchorApp.swift
//  Anchor
//
//  Created by Plimeor on 6/11/26.
//

import SwiftUI

@main
struct AnchorApp: App {
    var body: some Scene {
        WindowGroup("Anchor") {
            ContentView()
        }
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("New Note") {}
                    .keyboardShortcut("n")
                    .disabled(true)
            }
        }

        #if os(macOS)
        Settings {
            SettingsView()
        }
        #endif
    }
}

#if os(macOS)
private struct SettingsView: View {
    var body: some View {
        Form {
            LabeledContent("Core") {
                Text("anchor-core")
                    .foregroundStyle(.secondary)
            }
            LabeledContent("Sync") {
                Text("Not configured")
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .padding(20)
        .frame(width: 360)
    }
}
#endif
