namespace Protest.Tools;

internal static class WindowsLifecycle {
    private const int UPCOMING_WARNING_DAYS = 365;

    internal enum SupportState : byte {
        unknown      = 0,
        supported    = 1,
        expiringSoon = 2,
        outOfSupport = 3
    }

    internal enum EditionTrack : byte {
        unknown             = 0,
        generalAvailability = 1,
        enterprise          = 2,
        ltsc                = 3
    }

    internal readonly record struct Assessment(
        string productName,
        string release,
        string version,
        DateOnly? endOfSupport,
        SupportState state,
        int daysLeft,
        string details
    );

    private readonly record struct ReleaseInfo(
        string release,
        int build,
        DateOnly? generalAvailabilityEnd,
        DateOnly? enterpriseEnd,
        DateOnly? ltscEnd,
        DateOnly? iotLtscEnd,
        bool isClient
    );

    private static readonly ReleaseInfo[] windows10Releases = new[] {
        new ReleaseInfo("1507", 10240, new DateOnly(2017, 5, 9),   new DateOnly(2017, 5, 9),   null,                       null,                       true),
        new ReleaseInfo("1511", 10586, new DateOnly(2017, 10, 10), new DateOnly(2018, 4, 10),  null,                       null,                       true),
        new ReleaseInfo("1607", 14393, new DateOnly(2018, 4, 10),  new DateOnly(2019, 4, 9),   new DateOnly(2026, 10, 13), new DateOnly(2026, 10, 13), true),
        new ReleaseInfo("1703", 15063, new DateOnly(2018, 10, 9),  new DateOnly(2019, 10, 8),  null,                       null,                       true),
        new ReleaseInfo("1709", 16299, new DateOnly(2019, 4, 9),   new DateOnly(2020, 10, 13), null,                       null,                       true),
        new ReleaseInfo("1803", 17134, new DateOnly(2019, 11, 12), new DateOnly(2021, 5, 11),  null,                       null,                       true),
        new ReleaseInfo("1809", 17763, new DateOnly(2020, 11, 10), new DateOnly(2021, 5, 11),  new DateOnly(2029, 1, 9),   new DateOnly(2029, 1, 9),   true),
        new ReleaseInfo("1903", 18362, new DateOnly(2020, 12, 8),  new DateOnly(2020, 12, 8),  null,                       null,                       true),
        new ReleaseInfo("1909", 18363, new DateOnly(2021, 5, 11),  new DateOnly(2022, 5, 10),  null,                       null,                       true),
        new ReleaseInfo("2004", 19041, new DateOnly(2021, 12, 14), new DateOnly(2021, 12, 14), null,                       null,                       true),
        new ReleaseInfo("20H2", 19042, new DateOnly(2022, 5, 10),  new DateOnly(2023, 5, 9),   null,                       null,                       true),
        new ReleaseInfo("21H1", 19043, new DateOnly(2022, 12, 13), new DateOnly(2022, 12, 13), null,                       null,                       true),
        new ReleaseInfo("21H2", 19044, new DateOnly(2023, 6, 13),  new DateOnly(2024, 6, 11),  new DateOnly(2027, 1, 12),  new DateOnly(2032, 1, 13),  true),
        new ReleaseInfo("22H2", 19045, new DateOnly(2025, 10, 14), new DateOnly(2025, 10, 14), null,                       null,                       true),
    };

    private static readonly ReleaseInfo[] windows11Releases = new[] {
        new ReleaseInfo("21H2", 22000, new DateOnly(2023, 10, 10), new DateOnly(2024, 10, 8),  null,                      null, false),
        new ReleaseInfo("22H2", 22621, new DateOnly(2024, 10, 8),  new DateOnly(2025, 10, 14), null,                      null, false),
        new ReleaseInfo("23H2", 22631, new DateOnly(2025, 11, 11), new DateOnly(2026, 11, 10), null,                      null, false),
        new ReleaseInfo("24H2", 26100, new DateOnly(2026, 10, 13), new DateOnly(2027, 10, 12), new DateOnly(2029, 10, 9), new DateOnly(2034, 10, 10), false),
        new ReleaseInfo("25H2", 26200, new DateOnly(2027, 10, 12), new DateOnly(2028, 10, 10), null,                      null, false),
        new ReleaseInfo("26H1", 28000, new DateOnly(2028, 3, 14),  new DateOnly(2029, 3, 13),  null,                      null, false),
    };

    private static readonly (string product, int build, DateOnly extendedEnd)[] windowsServerReleases = new[] {
        ("Windows Server 2003",    3790,  new DateOnly(2015, 7, 14)),
        ("Windows Server 2008",    6003,  new DateOnly(2020, 1, 14)),
        ("Windows Server 2008 R2", 7601,  new DateOnly(2020, 1, 14)),
        ("Windows Server 2012",    9200,  new DateOnly(2023, 10, 10)),
        ("Windows Server 2012 R2", 9600,  new DateOnly(2023, 10, 10)),
        ("Windows Server 2016",    14393, new DateOnly(2027, 1, 12)),
        ("Windows Server 2019",    17763, new DateOnly(2029, 1, 9)),
        ("Windows Server 2022",    20348, new DateOnly(2031, 10, 14)),
        ("Windows Server 2025",    26100, new DateOnly(2034, 11, 14)),
    };

    public static bool TryAssess(string osName, string osVersion, out Assessment assessment) {
        assessment = default;

        if (String.IsNullOrWhiteSpace(osName) || !osName.Contains("windows", StringComparison.OrdinalIgnoreCase)) {
            return false;
        }

        if (!Version.TryParse(osVersion, out Version parsedVersion)) {
            return false;
        }

        EditionTrack track = GetEditionTrack(osName);
        int build = parsedVersion.Build;
        DateOnly today = DateOnly.FromDateTime(DateTime.UtcNow);

        if (TryAssessServer(osName, osVersion, build, today, out assessment)) {
            return true;
        }

        if (parsedVersion.Major < 10) {
            DateOnly? endOfSupport = parsedVersion.Major switch {
                <= 0 => null,
                6 when parsedVersion.Minor >= 3 => new DateOnly(2023, 1, 10), // Windows 8.1 / Server 2012 R2-era numbering
                6 when parsedVersion.Minor == 2 => new DateOnly(2016, 1, 12), // Windows 8
                6 when parsedVersion.Minor == 1 => new DateOnly(2020, 1, 14), // Windows 7
                6 => new DateOnly(2017, 4, 11), // Vista / 2008 generation
                _ => new DateOnly(2014, 4, 8),  // XP or older
            };

            assessment = BuildAssessment(
                productName: osName.Trim(),
                release: $"NT {parsedVersion.Major}.{parsedVersion.Minor}",
                version: osVersion,
                endOfSupport: endOfSupport,
                today: today,
                details: "Legacy Windows generation"
            );
            return true;
        }

        ReleaseInfo? release = FindRelease(osName, build, track);
        if (!release.HasValue) {
            return false;
        }

        DateOnly? end = GetEndOfSupport(release.Value, track, osName);
        string productName = NormalizeProductName(osName, release.Value, track);

        assessment = BuildAssessment(productName, release.Value.release, osVersion, end, today, null);
        return true;
    }

    private static bool TryAssessServer(string osName, string osVersion, int build, DateOnly today, out Assessment assessment) {
        assessment = default;

        if (!IsServerProduct(osName)) {
            return false;
        }

        (string Product, int Build, DateOnly ExtendedEnd)? product = FindBestServerRelease(build, osName);
        if (!product.HasValue) {
            return false;
        }

        assessment = BuildAssessment(product.Value.Product, product.Value.Product, osVersion, product.Value.ExtendedEnd, today, null);
        return true;
    }

    private static Assessment BuildAssessment(string productName, string release, string version, DateOnly? endOfSupport, DateOnly today, string details) {
        if (!endOfSupport.HasValue) {
            return new Assessment(productName, release, version, null, SupportState.unknown, Int32.MaxValue, details ?? String.Empty);
        }

        int daysRemaining = endOfSupport.Value.DayNumber - today.DayNumber;
        SupportState state =
            daysRemaining < 0 ? SupportState.outOfSupport :
            daysRemaining <= UPCOMING_WARNING_DAYS ? SupportState.expiringSoon :
            SupportState.supported;

        return new Assessment(productName, release, version, endOfSupport, state, daysRemaining, details ?? String.Empty);
    }

    private static ReleaseInfo? FindRelease(string osName, int build, EditionTrack track) {
        if (osName.Contains("windows 11", StringComparison.OrdinalIgnoreCase) || build >= 22000) {
            return FindBestRelease(windows11Releases, build);
        }

        if (osName.Contains("windows 10", StringComparison.OrdinalIgnoreCase) || build >= 10240) {
            return FindBestRelease(windows10Releases, build);
        }

        return null;
    }

    private static ReleaseInfo? FindBestRelease(ReleaseInfo[] releases, int build) {
        ReleaseInfo? match = null;

        for (int i = 0; i < releases.Length; i++) {
            if (build < releases[i].build) {
                continue;
            }

            if (!match.HasValue || releases[i].build > match.Value.build) {
                match = releases[i];
            }
        }

        return match;
    }

    private static (string Product, int Build, DateOnly ExtendedEnd)? FindBestServerRelease(int build, string osName) {
        (string Product, int Build, DateOnly ExtendedEnd)? match = null;

        for (int i = 0; i < windowsServerReleases.Length; i++) {
            if (build < windowsServerReleases[i].build) {
                continue;
            }

            if (!match.HasValue || windowsServerReleases[i].build > match.Value.Build) {
                match = windowsServerReleases[i];
            }
        }

        if (match.HasValue) {
            return match;
        }

        if (osName.Contains("server 2025", StringComparison.OrdinalIgnoreCase)) return windowsServerReleases[^1];
        if (osName.Contains("server 2022", StringComparison.OrdinalIgnoreCase)) return windowsServerReleases[^2];
        if (osName.Contains("server 2019", StringComparison.OrdinalIgnoreCase)) return windowsServerReleases[^3];
        if (osName.Contains("server 2016", StringComparison.OrdinalIgnoreCase)) return windowsServerReleases[^4];
        if (osName.Contains("server 2012 r2", StringComparison.OrdinalIgnoreCase)) return windowsServerReleases[^5];
        if (osName.Contains("server 2012", StringComparison.OrdinalIgnoreCase)) return windowsServerReleases[^6];
        if (osName.Contains("server 2008 r2", StringComparison.OrdinalIgnoreCase)) return windowsServerReleases[^7];
        if (osName.Contains("server 2008", StringComparison.OrdinalIgnoreCase)) return windowsServerReleases[^8];
        if (osName.Contains("server 2003", StringComparison.OrdinalIgnoreCase)) return windowsServerReleases[0];

        return null;
    }

    private static bool IsServerProduct(string osName) {
        return osName.Contains("windows server", StringComparison.OrdinalIgnoreCase)
            || osName.Contains("server standard", StringComparison.OrdinalIgnoreCase)
            || osName.Contains("server datacenter", StringComparison.OrdinalIgnoreCase)
            || osName.Contains("storage server", StringComparison.OrdinalIgnoreCase)
            || osName.Contains("hyper-v server", StringComparison.OrdinalIgnoreCase);
    }

    private static DateOnly? GetEndOfSupport(ReleaseInfo release, EditionTrack track, string osName) {
        return track switch {
            EditionTrack.ltsc when osName.Contains("iot", StringComparison.OrdinalIgnoreCase) && release.iotLtscEnd.HasValue => release.iotLtscEnd,
            EditionTrack.ltsc when release.ltscEnd.HasValue => release.ltscEnd,
            EditionTrack.enterprise when release.enterpriseEnd.HasValue => release.enterpriseEnd,
            _ => release.generalAvailabilityEnd
        };
    }

    private static EditionTrack GetEditionTrack(string osName) {
        if (osName.Contains("ltsc", StringComparison.OrdinalIgnoreCase) || osName.Contains("ltsb", StringComparison.OrdinalIgnoreCase)) {
            return EditionTrack.ltsc;
        }

        if (osName.Contains("enterprise", StringComparison.OrdinalIgnoreCase)
            || osName.Contains("education", StringComparison.OrdinalIgnoreCase)
            || osName.Contains("iot", StringComparison.OrdinalIgnoreCase)) {
            if (osName.Contains("pro education", StringComparison.OrdinalIgnoreCase)
                || osName.Contains("pro for workstations", StringComparison.OrdinalIgnoreCase)) {
                return EditionTrack.generalAvailability;
            }

            return EditionTrack.enterprise;
        }

        return EditionTrack.generalAvailability;
    }

    private static string NormalizeProductName(string osName, ReleaseInfo release, EditionTrack track) {
        string trimmed = osName.Trim();

        if (track != EditionTrack.ltsc) {
            return trimmed;
        }

        if (trimmed.Contains("windows 10", StringComparison.OrdinalIgnoreCase)) {
            return release.release switch {
                "1607" when trimmed.Contains("ltsb", StringComparison.OrdinalIgnoreCase) => trimmed.Replace("LTSB", "2016 LTSB", StringComparison.OrdinalIgnoreCase),
                "1607" => trimmed.Replace("LTSC", "2016 LTSB", StringComparison.OrdinalIgnoreCase),
                "1809" => trimmed.Replace("LTSC", "LTSC 2019", StringComparison.OrdinalIgnoreCase),
                "21H2" => trimmed.Replace("LTSC", "LTSC 2021", StringComparison.OrdinalIgnoreCase),
                _ => trimmed
            };
        }

        if (trimmed.Contains("windows 11", StringComparison.OrdinalIgnoreCase) && release.release == "24H2") {
            return trimmed.Replace("LTSC", "LTSC 2024", StringComparison.OrdinalIgnoreCase);
        }

        return trimmed;
    }
}
