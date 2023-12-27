using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using System.Collections.Immutable;
using System.Diagnostics;
using System.Text;

namespace CacheGenerator;

[Generator]
public class Generator : IIncrementalGenerator {
    public void Initialize(IncrementalGeneratorInitializationContext context) {
        IncrementalValuesProvider<ClassDeclarationSyntax> provider = context.SyntaxProvider.CreateSyntaxProvider(
            predicate: (d, _)=> d is ClassDeclarationSyntax,
            transform: (n, _)=> (ClassDeclarationSyntax)n.Node
        ).Where(m=> m is not null);

        IncrementalValueProvider<(Compilation Left, ImmutableArray<ClassDeclarationSyntax> Right)> compilation = context.CompilationProvider.Combine(provider.Collect());

        context.RegisterSourceOutput(
            compilation,
            (spc, source) => Execute(spc, source.Left, source.Right, context)
        );
    }

    private void Execute(SourceProductionContext context, Compilation compilation, ImmutableArray<ClassDeclarationSyntax> classes, IncrementalGeneratorInitializationContext initializationContext) {
        //if (!Debugger.IsAttached) { Debugger.Launch(); }

        string rootPath = compilation.SyntaxTrees
            .Where(o => o.FilePath.EndsWith($"Protest{Path.DirectorySeparatorChar}Program.cs"))
            .First().FilePath
            .ToString();

        rootPath = $"{rootPath.Substring(0, rootPath.Length - 10)}";

        string frontPath = $"{rootPath}Front";

        StringBuilder builder = new StringBuilder();

        builder.AppendLine("using System.Collections.Generic;");
        builder.AppendLine("namespace Protest.Http;");
        builder.AppendLine("public static class FrontSerialization {");

        builder.AppendLine("    public static Dictionary<string, byte[]> cache = new Dictionary<string, byte[]>() {");

        DirectoryInfo frontDirectory = new DirectoryInfo(frontPath);
        FileInfo[] files = frontDirectory.GetFiles();
        for (int i = 0; i < files.Length; i++) {
            byte[]? content = LoadFile(files[i].FullName);
            if (content is null) { continue; }

            builder.Append($"        {{ @\"{files[i].FullName}\", new byte[] {{");

            for (int j = 0; j < content.Length; j++) {
                if (j > 0) builder.Append(",");
                builder.Append(content[j].ToString());
            }

            builder.Append("} },");
            builder.AppendLine();
        }

        builder.AppendLine("    };");

        builder.AppendLine("}");

        context.AddSource("FrontSerialization.g.cs", builder.ToString());
    }

    private byte[]? LoadFile(string filePath) {
        FileInfo file = new FileInfo(filePath);
        if (!file.Exists) return null;

        using FileStream fs = new FileStream(filePath, FileMode.Open, FileAccess.Read);
        using BinaryReader br = new BinaryReader(fs);

        byte[] bytes = br.ReadBytes((int)file.Length);
        return bytes;
    }
}