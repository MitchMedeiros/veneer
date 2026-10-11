import Foundation
import SwiftUI

/// Doc comment
@available(iOS 15, *)
struct ContentView: View {
    @State private var count: Int = 0
    let items: [String: Double] = ["a": 1.5, "b": 0x1F]

    var body: some View {
        VStack(spacing: 8) {
            Text("Count: \(count)")
            Button("Add") { count += 1 }
        }
    }
}

// line comment
protocol Shape { var area: Double { get } }

enum Direction: String, CaseIterable {
    case north, south
    case custom(String)
}

func fetch<T: Decodable>(_ url: URL, as type: T.Type = T.self) async throws -> T {
    let (data, _) = try await URLSession.shared.data(from: url)
    guard let text = String(data: data, encoding: .utf8), !text.isEmpty else {
        throw URLError(.badServerResponse)
    }
    let multi = """
        multi \(text)
        """
    return try JSONDecoder().decode(T.self, from: data)
}

extension Array where Element: Equatable {
    func unique() -> [Element] { reduce(into: []) { if !$0.contains($1) { $0.append($1) } } }
}
