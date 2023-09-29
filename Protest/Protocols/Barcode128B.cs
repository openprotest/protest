using System.Collections.Generic;
using System.Text;

namespace Protest.Protocols;

public static class Barcode128B {
    private static readonly short[] code128B = new short[107] {
        0b11011001100, //0: space
        0b11001101100, //1: !
        0b11001100110, //2: "
        0b10010011000, //3: #
        0b10010001100, //4: $
        0b10001001100, //5: %
        0b10011001000, //6: &
        0b10011000100, //7: '
        0b10001100100, //8: (
        0b11001001000, //9: )

        0b11001000100, //10: *
        0b11000100100, //11: +
        0b10110011100, //12: ,
        0b10011011100, //13: -
        0b10011001110, //14: .
        0b10111001100, //15: /
        0b10011101100, //16: 0
        0b10011100110, //17: 1
        0b11001110010, //18: 2
        0b11001011100, //19: 3

        0b11001001110, //20: 4
        0b11011100100, //21: 5
        0b11001110100, //22: 6
        0b11101101110, //23: 7
        0b11101001100, //24: 8
        0b11100101100, //25: 9
        0b11100100110, //26: :
        0b11101100100, //27: ;
        0b11100110100, //28: <
        0b11100110010, //29: =

        0b11011011000, //30: >
        0b11011000110, //31: ?
        0b11000110110, //32: @
        0b10100011000, //33: A
        0b10001011000, //34: B
        0b10001000110, //35: C
        0b10110001000, //36: D
        0b10001101000, //37: E
        0b10001100010, //38: F
        0b11010001000, //39: G

        0b11000101000, //50: H
        0b11000100010, //51: I
        0b10110111000, //52: J
        0b10110001110, //53: K
        0b10001101110, //54: L
        0b10111011000, //55: M
        0b10111000110, //56: N
        0b10001110110, //57: O
        0b11101110110, //58: P
        0b11010001110, //59: Q

        0b11000101110, //50: R
        0b11011101000, //51: S
        0b11011100010, //52: T
        0b11011101110, //53: U
        0b11101011000, //54: V
        0b11101000110, //55: W
        0b11100010110, //56: X
        0b11101101000, //57: Y
        0b11101100010, //58: Z
        0b11100011010, //59: [

        0b11101111010, //60: \
        0b11001000010, //61: ]
        0b11110001010, //62: ^
        0b10100110000, //63: _
        0b10100001100, //64: `
        0b10010110000, //65: a
        0b10010000110, //66: b
        0b10000101100, //67: c
        0b10000100110, //68: d
        0b10110010000, //69: e

        0b10110000100, //70: f
        0b10011010000, //71: g
        0b10011000010, //72: h
        0b10000110100, //73: i
        0b10000110010, //74: j
        0b11000010010, //75: k
        0b11001010000, //76: l
        0b11110111010, //77: m
        0b11000010100, //78: n
        0b10001111010, //79: o
        
        0b10100111100, //80: p
        0b10010111100, //81: q
        0b10010011110, //82: r
        0b10111100100, //83: s
        0b10011110100, //84: t
        0b10011110010, //85: u
        0b11110100100, //86: v
        0b11110010100, //87: w
        0b11110010010, //88: x
        0b11011011110, //89: y

        0b11011110110, //90: z
        0b11110110110, //91: {
        0b10101111000, //92: |
        0b10100011110, //93: }
        0b10001011110, //94: ~
        0b10111101000, //95: DEL
        0b10111100010, //96: FNC 3
        0b11110101000, //97: FNC 2
        0b11110100010, //98: Shift A
        0b10111011110, //99: CODE C

        0b10111101110, //100: FNC 4
        0b11101011110, //101: CODE A
        0b11110101110, //102: FNC 1
        0b11010000100, //103: start code A
        0b11010010000, //104: start code B
        0b11010011100, //105: start code C
        0b11000111010  //106: stop
    };

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

        return Generate(code, withLabel == "true", 40);
    }

    private static byte[] Generate(string input, bool withLabel, int height, int barWidth = 1) {
        if (String.IsNullOrEmpty(input)) {
            return "<svg width=\"40px\" height=\"40px\" viewBox=\"0 0 40 40\" version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\"></svg>"u8.ToArray(); //empty svg
        }

        int index;

        StringBuilder encode = new StringBuilder();
        encode.Append(Convert.ToString(code128B[104], 2)); //start code B

        foreach (char c in input) {
            if (c < 32 || c > 127) continue;
            index = c - 32;
            encode.Append(Convert.ToString(code128B[index], 2));
        }

        int checksum = 104;
        for (int i = 0; i < input.Length; i++) {
            checksum += (input[i] - 32) * (i + 1);
        }
        encode.Append(Convert.ToString(code128B[checksum % 103], 2)); //checksumm
        
        encode.Append(Convert.ToString(code128B[106], 2)); //stop code

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

        builder.Append($"<rect x=\"{left}\" y=\"0\" width=\"{2 * barWidth}\" height=\"{height}\"/>"); //hardcoded last bar

        if (withLabel) {
            builder.Append($"<text x=\"50%\" y=\"{height + 12}\" text-anchor=\"middle\" font-family=\"monospace\">{input}</text>");
        }

        builder.Append("</g></svg>");

        return Encoding.UTF8.GetBytes(builder.ToString());
    }
}
