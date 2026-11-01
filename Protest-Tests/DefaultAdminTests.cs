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
        Assert.That(access.authorization, Is.EqualTo(new[] { "*" }));
        Assert.That(Auth.IsAuthorized(access, "/rbac/create"), Is.True);
        Assert.That(Auth.IsAuthorized(access, "/ws/terminal"), Is.True);
        Assert.That(Auth.IsAuthorized(access, "/config/backup/download"), Is.True);
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

    //"*" is stored as is, an admin reloaded on the next start must keep full access
    [Test]
    public void FullAccessSurvivesReload() {
        Auth.EnsureDefaultAdmin();

        Assert.That(Auth.LoadRbac(), Is.True);
        Assert.That(Auth.rbac.TryGetValue(Auth.DEFAULT_ADMIN_USERNAME, out Auth.AccessControl access), Is.True);
        Assert.That(access.authorization, Is.EqualTo(new[] { "*" }));
        Assert.That(Auth.IsAuthorized(access, "/rbac/create"), Is.True);
    }

    //session recordings and windows events used to be read only, now single toggles stored as write, existing entries keep their access
    [Test]
    public void ReadOnlyPermissionsAreRenamedOnLoad() {
        Auth.SaveAccessControl(new Auth.AccessControl {
            username      = "bob",
            passwordHash  = Cryptography.HashUsernameAndPassword("bob", "unit-test"),
            authorization = new[] { "session recordings:read", "windows events:read", "devices:read" }
        });

        Assert.That(Auth.LoadRbac(), Is.True);
        Assert.That(Auth.rbac["bob"].authorization, Is.EqualTo(new[] { "session recordings:write", "windows events:write", "devices:read" }));
        Assert.That(Auth.IsAuthorized(Auth.rbac["bob"], "/recordings/list"), Is.True);
        Assert.That(Auth.IsAuthorized(Auth.rbac["bob"], "/winevents/list"), Is.True);
    }

    //only "*" skips the path check, an explicit list grants its own paths and nothing else
    [Test]
    public void ExplicitPermissionsDoNotGrantEverything() {
        Auth.AccessControl access = new Auth.AccessControl {
            authorization = new[] { "devices:read" },
            accessPath    = Auth.PopulateAccessPath(new[] { "devices:read" })
        };

        Assert.That(Auth.IsAuthorized(access, "/db/device/list"), Is.True);
        Assert.That(Auth.IsAuthorized(access, "/rbac/create"), Is.False);
    }
}
