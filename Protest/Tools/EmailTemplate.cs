using System.Net;

namespace Protest.Tools;

internal static class EmailTemplate {
    public static string Render(string title, int width, string alignment, string rows) => $"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"></head>
        <body style="background-color:#e0e0e0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#e0e0e0" style="background-color:#e0e0e0">
        <tr><td>&nbsp;</td></tr>
        <tr><td align="center">
        <table role="presentation" width="{width + 16}" cellpadding="0" cellspacing="0" border="0" bgcolor="#a8a8a8" style="border-collapse:separate;border-radius:8px 8px 0 0;box-shadow:#808080 0 0 8px">
        <tr><td align="center" valign="middle" height="32" style="height:32px;padding:0 8px;color:#202020;font-family:Arial,sans-serif;font-size:14px;font-weight:bold">{WebUtility.HtmlEncode(title)}</td></tr>
        <tr><td style="padding:0 8px 8px">
        <table role="presentation" width="{width}" cellpadding="0" cellspacing="0" border="0" bgcolor="#c0c0c0" style="border-collapse:separate;border-radius:4px;color:#202020;text-align:{alignment}">
        {rows}
        </table>
        </td></tr>
        </table>
        </td></tr>
        <tr><td>&nbsp;</td></tr>
        <tr><td align="center" style="color:#202020">Sent from <a href="https://github.com/openprotest" style="color:#98420f">Pro-test</a></td></tr>
        <tr><td>&nbsp;</td></tr>
        </table>
        </body>
        </html>
        """;
}
