using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.MSBuild;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using System.Collections.Immutable;
using System.Text;
using System.Diagnostics;

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

        StringBuilder bulder = new StringBuilder();

        bulder.AppendLine("namespace Protest.Http;");
        bulder.AppendLine("public static class FrontSerialization {");

        bulder.AppendLine("    public static string[] array = new string[] {");

        //bulder.AppendLine($"        @\"{frontPath}\",");

        DirectoryInfo frontDirectory = new DirectoryInfo(frontPath);
        FileInfo[] files = frontDirectory.GetFiles();
        for (int i = 0; i < files.Length; i++) {
            bulder.AppendLine($"        @\"{files[i].FullName}\",");
        }

        bulder.AppendLine("    };");

        bulder.AppendLine("}");

        context.AddSource("FrontSerialization.g.cs", bulder.ToString());
    }
}