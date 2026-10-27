using Protest.Http;

namespace Protest.Tests;

//With no backdoor, the default admin is the only way into a fresh install. It must get every permission,
//a password nobody can guess, renewed on every start until the first sign-in, and never replace other RBAC entries.
//Works on Data.DIR_RBAC, which lives in the test output directory.
[NonParallelizable]
public class DefaultAdminTests {
    private static string AdminFile => Path.Join(Data.DIR_RBAC, Auth.DEFAULT_ADMIN_USERNAME);

    [SetUp]
    public void Setup() => Reset();

    [TearDown]
    public void TearDown() => Reset();

    private static void Reset() {
        Auth.rbac.Clear();
        if (Directory.Exists(Data.DIR_RBAC)) Directory.Delete(Data.DIR_RBAC, true);
        Directory.CreateDirectory(Data.DIR_RBAC);
    }

    [Test]
    public void FreshInstallGetsAdminWithEveryPermission() {
        string password = Auth.EnsureDefaultAdmin();

        Assert.That(password, Is.Not.Null);
        Assert.That(File.Exists(AdminFile), Is.True);
        Assert.That(Auth.rbac.TryGetValue(Auth.DEFAULT_ADMIN_USERNAME, out Auth.AccessControl access), Is.True);
        Assert.That(access.authorization, Is.EquivalentTo(Auth.ALL_PERMISSIONS));
        Assert.That(access.accessPath, Does.Contain("/rbac/create"));
        Assert.That(access.accessPath, Does.Contain("/ws/terminal"));
        Assert.That(access.accessPath, Does.Contain("/config/backup/download"));
        Assert.That(access.passwordHash, Is.EqualTo(Cryptography.HashUsernameAndPassword(Auth.DEFAULT_ADMIN_USERNAME, password)));
    }

    [Test]
    public void PasswordIsRandom() {
        string password = Auth.EnsureDefaultAdmin();
        Assert.That(password, Does.Match("^[0-9A-F]{8}(-[0-9A-F]{8}){3}$"));
    }

    [Test]
    public void EveryStartRegeneratesWhileNobodySignedIn() {
        string first = Auth.EnsureDefaultAdmin();
        string second = Auth.EnsureDefaultAdmin();

        Assert.That(second, Is.Not.Null);
        Assert.That(second, Is.Not.EqualTo(first));
        Assert.That(Auth.rbac[Auth.DEFAULT_ADMIN_USERNAME].passwordHash,
            Is.EqualTo(Cryptography.HashUsernameAndPassword(Auth.DEFAULT_ADMIN_USERNAME, second)));
    }

    [Test]
    public void AdminIsKeptAfterFirstSignIn() {
        Auth.EnsureDefaultAdmin();
        Auth.AccessControl access = Auth.rbac[Auth.DEFAULT_ADMIN_USERNAME];
        access.totpSecret = new byte[] { 0x01 }; //TOTP enrollment completes the first sign-in
        byte[] hash = access.passwordHash;

        Assert.That(Auth.EnsureDefaultAdmin(), Is.Null);
        Assert.That(Auth.rbac[Auth.DEFAULT_ADMIN_USERNAME].passwordHash, Is.EqualTo(hash));
    }

    [Test]
    public void AdminIsKeptOnceOtherUsersExist() {
        Auth.EnsureDefaultAdmin();
        Auth.rbac["bob"] = new Auth.AccessControl { username = "bob" };

        Assert.That(Auth.EnsureDefaultAdmin(), Is.Null);
    }

    [Test]
    public void UnreadableEntriesAreNeverReplaced() {
        byte[] unreadable = { 0x01, 0x02 }; //on disk, but failed to load, e.g. a wrong db_key
        File.WriteAllBytes(AdminFile, unreadable);

        Assert.That(Auth.EnsureDefaultAdmin(), Is.Null);
        Assert.That(File.ReadAllBytes(AdminFile), Is.EqualTo(unreadable));
        Assert.That(Auth.rbac.ContainsKey(Auth.DEFAULT_ADMIN_USERNAME), Is.False);
    }

    //catches a typo in ALL_PERMISSIONS, which would silently grant nothing
    [Test]
    public void EveryPermissionGrantsAccess() {
        int baseline = Auth.PopulateAccessPath(Array.Empty<string>()).Count;

        foreach (string permission in Auth.ALL_PERMISSIONS) {
            if (permission == "update:write") continue; //offered by the RBAC editor, no server routes yet
            Assert.That(Auth.PopulateAccessPath(new[] { permission }).Count, Is.GreaterThan(baseline), permission);
        }
    }
}
