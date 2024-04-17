using System.Collections.Generic;
using System.Net;
using System.Text;

namespace Protest.Protocols;

public static class Barcode39 {
    private static readonly short[] code39 = new short[44] {
        0b101001101101,
        0b110100101011,
        0b101100101011,
        0b110110010101,
        0b101001101011,
        0b110100110101,
        0b101100110101,
        0b101001011011,
        0b110100101101,
        0b101100101101,
        0b110101001011,
        0b101101001011,
        0b110110100101,
        0b101011001011,
        0b110101100101,
        0b101101100101,
        0b101010011011,
        0b110101001101,
        0b101101001101,
        0b101011001101,
        0b110101010011,
        0b101101010011,
        0b110110101001,
        0b101011010011,
        0b110101101001,
        0b101101101001,
        0b101010110011,
        0b110101011001,
        0b101101011001,
        0b101011011001,
        0b110010101011,
        0b100110101011,
        0b110011010101,
        0b100101101011,
        0b110010110101,
        0b100110110101,
        0b100101011011,
        0b110010101101,
        0b100110101101,
        0b100100100101,
        0b100100101001,
        0b100101001001,
        0b101001001001,
        0b100101101101
    };

    public static byte[] GenerateSvgHandler(HttpListenerContext ctx, Dictionary<string, string> parameters) {
        ctx.Response.ContentType = "image/svg+xml; charset=utf-8";
        return GenerateSvgHandler(parameters);
    }

    public static byte[] GenerateSvgHandler(Dictionary<string, string> parameters) {
        if (parameters is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        parameters.TryGetValue("code", out string code);
        parameters.TryGetValue("withlabel", out string withLabel);

        if (code is null) {
            return Data.CODE_INVALID_ARGUMENT.Array;
        }

        withLabel ??= String.Empty;

        return Generate(code, withLabel=="true", 40);
    }

    private static byte[] Generate(string input, bool withLabel, int height, int barWidth = 1) {
        if (String.IsNullOrEmpty(input)) {
            return "<svg width=\"40px\" height=\"40px\" viewBox=\"0 0 40 40\" version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\"></svg>"u8.ToArray();
        }

        ReadOnlySpan<byte> charSet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%*"u8;
        int index;

        StringBuilder encode = new StringBuilder();
        encode.Append(Convert.ToString(code39[43], 2) + '0'); //start

        foreach (char c in input.ToUpper()) {
            index = charSet.IndexOf((byte)c);
            if (index < 0) continue;
            encode.Append(Convert.ToString(code39[index], 2) + '0');
        }

        encode.Append(Convert.ToString(code39[43], 2)); //stop
        encode.Append('0');

        string encoded = encode.ToString();


        int padding = 16;
        int svgWidth = encoded.Length * barWidth + padding*2;

        height = Math.Max(height, 40);

        StringBuilder builder = new StringBuilder();
        builder.Append($"<svg width=\"{svgWidth}px\" height=\"{height}px\" viewBox=\"0 0 {svgWidth} {height}\" version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\">");
        builder.Append("<g fill=\"#000\">");

        if (withLabel) height -= 16;

        int left = padding, width = 0;
        index = 0;
        while (index < encoded.Length) {
            if (encoded[index] == '1') {
                width++;
            }
            else {
                if (width > 0) builder.Append($"<rect x=\"{left}\" y=\"0\" width=\"{width * barWidth}\" height=\"{height}\"/>");
                left += (width + 1) * barWidth;
                width = 0;
            }
            index++;
        }

        if (withLabel) {
            builder.Append($"<text x=\"50%\" y=\"{height+12}\" text-anchor=\"middle\" font-family=\"monospace\">{input.ToUpper()}</text>");
        }

        builder.Append("</g></svg>");

        return Encoding.UTF8.GetBytes(builder.ToString());
    }
}