//
//  AnchorMacICloudProbeApp.swift
//  AnchorMacICloudProbe
//
//  Created by Plimeor on 6/8/26.
//

import SwiftUI

@main
struct AnchorMacICloudProbeApp: App {
    init() {
        guard let command = ICloudProbeCommand(arguments: CommandLine.arguments) else {
            return
        }

        do {
            try ICloudRuntimeProbe.run(command: command)
            Foundation.exit(EXIT_SUCCESS)
        } catch {
            fputs("icloud_probe_error \(error)\n", stderr)
            Foundation.exit(EXIT_FAILURE)
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
