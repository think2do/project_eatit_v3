import AppKit
import Foundation
import UniformTypeIdentifiers

// §A0.1: files.user-selected.read-write entitlement (M1.4) covers NSOpenPanel + drag-and-drop
// via Powerbox. No new entitlement needed.
// §C3: payload is user-selected resume/transcript content, not secret material.

struct PickedFile: Encodable, Equatable {
    let name: String
    let size: Int
    let base64: String
}

final class FilePickerService {

    /// Pure helper — exposed for unit testing without GUI.
    /// Returns nil when the file cannot be read (missing or permission denied).
    static func makePickedFile(from url: URL) -> PickedFile? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return PickedFile(
            name: url.lastPathComponent,
            size: data.count,
            base64: data.base64EncodedString()
        )
    }

    /// Launches NSOpenPanel modally on the main actor. Returns selected files (empty on cancel).
    /// `accept` is filename extensions e.g. ["pdf", "docx", "txt"]; nil means no filter.
    @MainActor
    func pick(accept: [String]?, multiple: Bool) async -> [PickedFile] {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = multiple
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        if let accept = accept, !accept.isEmpty {
            panel.allowedContentTypes = accept.compactMap {
                UTType(filenameExtension: $0)
            }
        }
        guard panel.runModal() == .OK else { return [] }
        return panel.urls.compactMap(Self.makePickedFile(from:))
    }
}
