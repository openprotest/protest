using System.Linq;
using Protest.Http;

namespace Protest.Tools;

internal static class VaultAccessControl {
    public enum PermissionMode {
        None,
        Whitelist,
        Blacklist
    }

    public static bool IsAllowed(PermissionMode mode, string[] permissionList, string username) {
        if (mode == PermissionMode.None) return true;

        if (String.Equals(username, "loopback", StringComparison.OrdinalIgnoreCase)) return true;

        bool listed = permissionList is not null
            && permissionList.Any(u => String.Equals(u, username, StringComparison.OrdinalIgnoreCase));

        return mode == PermissionMode.Whitelist ? listed : !listed;
    }

    public static string[] NormalizePermissionList(string[] list) {
        return (list ?? Array.Empty<string>())
            .Where(u => !String.IsNullOrWhiteSpace(u))
            .Select(u => u.Trim().ToLowerInvariant())
            .Where(u => Auth.rbac.ContainsKey(u))
            .Distinct()
            .ToArray();
    }
}
