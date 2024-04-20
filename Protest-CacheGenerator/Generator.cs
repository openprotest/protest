using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using System.Collections.Immutable;
using System.IO.Compression;
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
            (spc, source) => Execute(spc, source.Left)
        );
    }

    private void Execute(SourceProductionContext context, Compilation compilation) {
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
        builder.AppendLine("internal static class StaticCacheSerialization {");

        builder.AppendLine("    public static readonly Dictionary<string, byte[]> cache = new Dictionary<string, byte[]>() {");
        
        LoadDirectory(frontPath, frontPath, builder);

        builder.AppendLine("    };");

        builder.AppendLine("}");

        context.AddSource("StaticCacheSerialization.g.cs", builder.ToString());
    }

    private void LoadDirectory(string front, string target, StringBuilder builder) {
        DirectoryInfo targetDirectory = new DirectoryInfo(target);
        if (!targetDirectory.Exists) { return; }

        FileInfo[] files = targetDirectory.GetFiles();
        for (int i = 0; i < files.Length; i++) {
            byte[]? content = LoadFile(files[i].FullName);
            if (content is null) { continue; }

            /*
            string b64 = Convert.ToBase64String(content);
            builder.AppendLine($"        {{ @\"{files[i].FullName.Substring(front.Length)}\", Convert.FromBase64String(\"{b64}\")}},");
            */

            builder.Append($"        {{ @\"{files[i].FullName.Substring(front.Length)}\", new byte[] {{");
            for (int j = 0; j < content.Length; j++) {
                if (j > 0) { builder.Append(","); }
                builder.Append(content[j].ToString());
            }
            builder.Append("} },");
            builder.AppendLine();
        }

        DirectoryInfo[] subdirectories = targetDirectory.GetDirectories();
        for (int i = 0; i < subdirectories.Length; i++) {
            LoadDirectory(front, subdirectories[i].FullName, builder);
        }
    }

    private byte[]? LoadFile(string filePath) {
        FileInfo file = new FileInfo(filePath);
        if (!file.Exists) return null;

        using FileStream fs = new FileStream(filePath, FileMode.Open, FileAccess.Read);
        using BinaryReader br = new BinaryReader(fs);
        byte[] bytes = br.ReadBytes((int)file.Length);

        if ( filePath.EndsWith(".htm") ||
             filePath.EndsWith(".html") ||
             filePath.EndsWith(".svg") ||
             filePath.EndsWith(".css") ||
             filePath.EndsWith(".js")) {
            
            bytes = Minify(bytes, false);
        }

        MemoryStream ms = new MemoryStream();
        using (GZipStream zip = new GZipStream(ms, CompressionMode.Compress, true)) {
            zip.Write(bytes, 0, bytes.Length);
        }

        return ms.ToArray();
    }
    public static byte[] Minify(byte[] bytes, bool softMinify) {
        string text = Encoding.Default.GetString(bytes);
        StringBuilder result = new StringBuilder();

        string[] lines = text.Split('\n');

        foreach (string line in lines) {
            string trimmedLine = line.Trim();
            if (string.IsNullOrEmpty(trimmedLine)) continue;
            if (trimmedLine.StartsWith("//")) continue;

            int commentIndex = trimmedLine.IndexOf("//");
            if (commentIndex >= 0 && !trimmedLine.Contains("://")) {
                trimmedLine = trimmedLine.Substring(0, commentIndex).TrimEnd();
            }

            trimmedLine = trimmedLine.Replace("\t", " ");

            while (trimmedLine.Contains("  ")) {
                trimmedLine = trimmedLine.Replace("  ", " ");
            }

            trimmedLine = trimmedLine.Replace(" = ", "=")
                                     .Replace(" == ", "==")
                                     .Replace(" === ", "===")
                                     .Replace(" != ", "!=")
                                     .Replace(" !== ", "!==")
                                     .Replace("{ {", "{{")
                                     .Replace("} }", "}}")
                                     .Replace(") {", "){")
                                     .Replace("; ", ";")
                                     .Replace(": ", ":")
                                     .Replace(" !impossible;", "!impossible;");

            if (softMinify) {
                result.AppendLine(trimmedLine);
            }
            else {
                result.Append(trimmedLine);
            }
        }

        int startIndex, endIndex;
        while ((startIndex = result.ToString().IndexOf("/*")) >= 0 &&
               (endIndex = result.ToString().IndexOf("*/", startIndex)) >= 0) {
            result.Remove(startIndex, endIndex - startIndex + 2);
        }

        return Encoding.UTF8.GetBytes(result.ToString());
    }

}