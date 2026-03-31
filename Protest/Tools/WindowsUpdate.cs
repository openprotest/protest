using Protest.Tasks;
using System.Collections.Generic;
using System.Runtime.Versioning;
using System.Xml.Linq;


namespace Protest.Tools;

internal static class WindowsUpdate {

    private const string CRITICAL_CATEGORY_ID = "E6CF1350-C01B-414D-A61F-263D14D133B4";
    private const string SECURITY_CATEGORY_ID = "0FA1201D-4330-4FA8-8AE9-B877473B6441";

    [SupportedOSPlatform("windows")]
    internal static bool CheckEntry(Database.Entry device, out List<Issues.Issue?> issues) {
        if (device is null) {
            issues = null;
            return false;
        }

        try {
            bool hasIp       = device.attributes.TryGetValue("ip", out Database.Attribute ip);
            bool hasHostname = device.attributes.TryGetValue("hostname", out Database.Attribute hostname);

            string ipString       = ip?.value.Split(';')[0];
            string hostnameString = hostname?.value.Split(';')[0];

            if (string.IsNullOrWhiteSpace(ipString) || string.IsNullOrWhiteSpace(hostnameString)) {
                issues = null;
                return false;
            }

            string name = hasHostname ? hostnameString : ipString;

            if (hasIp) {
                return GetUpdates(ipString, device.filename, name, out issues);
            }
            else if (hasHostname) {
                return GetUpdates(hostnameString, device.filename, hostnameString, out issues);
            }
            else {
                issues = null;
                return false;
            }
        }
        catch (Exception ex) {
            Console.WriteLine(ex);
            Console.WriteLine();
            issues = null;
            return false;
        }
    }

    [SupportedOSPlatform("windows")]
    private static bool GetUpdates(string host, string file, string name, out List<Issues.Issue?> issues) {
        Type sessionType = Type.GetTypeFromProgID("Microsoft.Update.Session", host, true);

        dynamic session = Activator.CreateInstance(sessionType)!;
        session.ClientApplicationID = "Pro-test";

        dynamic searcher = session.CreateUpdateSearcher();
        dynamic result = searcher.Search("IsInstalled=0 and IsHidden=0 and Type='Software'");

        List<dynamic> critical = new List<dynamic>();
        List<dynamic> security = new List<dynamic>();
        List<dynamic> other    = new List<dynamic>();

        for (int i = 0; i < result.Updates.Count; i++) {
            dynamic update = result.Updates.Item(i);

            bool isCritical = false;
            bool isSecurity = false;

            for (int j = 0; j < update.Categories.Count; j++) {
                dynamic category = update.Categories.Item(j);

                string categoryType = category.Type;
                if (!string.Equals(categoryType, "UpdateClassification", StringComparison.OrdinalIgnoreCase)) {
                    continue;
                }

                string categoryId = Convert.ToString(category.CategoryID) ?? string.Empty;
                if (string.Equals(categoryId, CRITICAL_CATEGORY_ID, StringComparison.OrdinalIgnoreCase)) {
                    isCritical = true;
                    break;
                }
                else if (string.Equals(categoryId, SECURITY_CATEGORY_ID, StringComparison.OrdinalIgnoreCase)) {
                    isSecurity = true;
                    break;
                }
            }

            if (isCritical) {
                critical.Add(update);
            }
            else if (isSecurity) {
                security.Add(update);
            }
            else {
                other.Add(update);
            }

            /*
            string kbs = update.KbArticleIds.Count == 0
                ? "-"
                : string.Join(", ", update.KbArticleIds.Select());
            */
        }

        issues = new List<Issues.Issue?>();

        if (critical.Count > 0) {
            issues.Add(new Issues.Issue {
                severity   = Issues.SeverityLevel.critical,
                message    = $"Critical updates are available ({critical.Count})",
                name       = name,
                identifier = host,
                category   = "Operating system",
                source     = "WUA",
                file       = file,
                isUser     = false
            });
        }

        if (security.Count > 0) {
            issues.Add(new Issues.Issue {
                severity   = Issues.SeverityLevel.warning,
                message    = $"Security updates are available ({security.Count})",
                name       = name,
                identifier = host,
                category   = "Operating system",
                source     = "WUA",
                file       = file,
                isUser     = false
            });
        }

        if (other.Count > 0) {
            issues.Add(new Issues.Issue {
                severity   = Issues.SeverityLevel.info,
                message    = $"Updates are available ({other.Count})",
                name       = name,
                identifier = host,
                category   = "Operating system",
                source     = "WUA",
                file       = file,
                isUser     = false
            });
        }

        return true;
    }

}