import PackagePlugin

@main
struct FolioleFramedSyncGenerator: BuildToolPlugin {
    func createBuildCommands(
        context: PluginContext,
        target: Target
    ) async throws -> [Command] {
        guard let sourceTarget = target as? SwiftSourceModuleTarget,
              let proto = sourceTarget.sourceFiles.first(where: {
                  $0.path.lastComponent == "framed_sync.proto"
              }) else {
            throw GeneratorError.protoMissing
        }
        let protoc = try context.tool(named: "protoc").path
        let generator = try context.tool(named: "protoc-gen-swift").path
        let output = context.pluginWorkDirectory.appending("framed_sync.pb.swift")
        return [.buildCommand(
            displayName: "Generate framed sync Swift types",
            executable: protoc,
            arguments: [
                "--plugin=protoc-gen-swift=\(generator.string)",
                "--swift_out=\(context.pluginWorkDirectory.string)",
                "--swift_opt=Visibility=Public",
                "-I", proto.path.removingLastComponent().string,
                proto.path.string
            ],
            inputFiles: [proto.path, generator],
            outputFiles: [output]
        )]
    }
}

private enum GeneratorError: Error {
    case protoMissing
}
