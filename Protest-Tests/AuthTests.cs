using System.Net;
using Protest.Http;

namespace Protest.Tests;

//Auth.GetPrincipal decides who a request acts as. "loopback" passes every vault access list,
//so it must only ever come from the backdoor, never from a user who signed in on the server itself.
[NonParallelizable]
public class AuthTests {
    private static readonly IPAddress REMOTE = IPAddress.Parse("10.0.0.5");

    private bool backdoor;
    private string sessionId = String.Empty;

    [SetUp]
    public void Setup() {
        backdoor = Configuration.backdoor;
        sessionId = $"unit-test-{Guid.NewGuid()}";

        Auth.sessions[sessionId] = new Auth.Session {
            access = new Auth.AccessControl {
                username      = "alice",
                authorization = Array.Empty<string>(),
                accessPath    = new HashSet<string>()
            },
            ip        = IPAddress.Loopback,
            sessionId = sessionId,
            guid      = Guid.NewGuid(),
            loginDate = DateTime.UtcNow.Ticks,
            ttl       = TimeSpan.TicksPerHour
        };
    }

    [TearDown]
    public void TearDown() {
        Configuration.backdoor = backdoor;
        Auth.sessions.TryRemove(sessionId, out _);
    }

    [TestCase(true,  "127.0.0.1")]
    [TestCase(true,  "::1")]
    [TestCase(false, "127.0.0.1")]
    [TestCase(true,  "10.0.0.5")]
    [TestCase(false, "10.0.0.5")]
    public void SessionIsTheSignedInUser(bool backdoorEnabled, string remote) {
        Configuration.backdoor = backdoorEnabled;
        Assert.That(Auth.GetPrincipal(sessionId, IPAddress.Parse(remote)), Is.EqualTo("alice"));
    }

    [TestCase("127.0.0.1")]
    [TestCase("127.10.20.30")]
    [TestCase("::1")]
    public void BackdoorLoopbackWithoutSessionIsLoopback(string remote) {
        Configuration.backdoor = true;
        Assert.That(Auth.GetPrincipal(null, IPAddress.Parse(remote)), Is.EqualTo("loopback"));
    }

    [Test]
    public void BackdoorLoopbackWithUnknownSessionIsLoopback() {
        Configuration.backdoor = true;
        Assert.That(Auth.GetPrincipal("no-such-session", IPAddress.Loopback), Is.EqualTo("loopback"));
    }

    [Test]
    public void LoopbackWithoutBackdoorOrSessionIsNobody() {
        Configuration.backdoor = false;
        Assert.That(Auth.GetPrincipal(null, IPAddress.Loopback), Is.Null);
        Assert.That(Auth.GetPrincipal("no-such-session", IPAddress.IPv6Loopback), Is.Null);
    }

    [TestCase(true)]
    [TestCase(false)]
    public void RemoteWithoutSessionIsNobody(bool backdoorEnabled) {
        Configuration.backdoor = backdoorEnabled;
        Assert.That(Auth.GetPrincipal(null, REMOTE), Is.Null);
        Assert.That(Auth.GetPrincipal("no-such-session", REMOTE), Is.Null);
    }

    [Test]
    public void MissingRemoteAddressWithoutSessionIsNobody() {
        Configuration.backdoor = true;
        Assert.That(Auth.GetPrincipal(null, null), Is.Null);
    }

    [Test]
    public void RevokedSessionNoLongerActsAsTheUser() {
        Configuration.backdoor = false;
        Auth.sessions.TryRemove(sessionId, out _);
        Assert.That(Auth.GetPrincipal(sessionId, IPAddress.Loopback), Is.Null);
    }
}
