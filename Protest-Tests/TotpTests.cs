using OtpNet;
using Protest.Http;

namespace Protest.Tests;

//A six digit code falls to guessing unless the wrong guesses are capped, and a code someone saw being typed
//must not open a second session. ValidateTotp enforces both, for sign-in and for enrollment.
public class TotpTests {
    private static readonly byte[] SECRET = Enumerable.Range(1, 20).Select(i => (byte)i).ToArray();

    private static Auth.OtpToken NewToken(string username = null) => new Auth.OtpToken {
        tokenId  = Guid.NewGuid().ToString(),
        username = username ?? $"unit-test-{Guid.NewGuid()}",
        secret   = SECRET
    };

    private static string Code(DateTime time) => new Totp(SECRET).ComputeTotp(time);

    [Test]
    public void CurrentCodeIsAccepted() {
        Assert.That(Auth.ValidateTotp(NewToken(), Code(DateTime.UtcNow)), Is.True);
    }

    [Test]
    public void CodeIsAcceptedOnlyOnce() {
        Auth.OtpToken token = NewToken();
        string code = Code(DateTime.UtcNow);

        Assert.That(Auth.ValidateTotp(token, code), Is.True);
        Assert.That(Auth.ValidateTotp(token, code), Is.False);
        Assert.That(Auth.ValidateTotp(NewToken(token.username), code), Is.False, "a new token for the same user");
    }

    [Test]
    public void EarlierCodeIsRefusedOnceALaterOneWasUsed() {
        Auth.OtpToken token = NewToken();
        string previous = Code(DateTime.UtcNow.AddSeconds(-30));
        string current = Code(DateTime.UtcNow);

        Assert.That(Auth.ValidateTotp(token, current), Is.True);
        Assert.That(Auth.ValidateTotp(NewToken(token.username), previous), Is.False);
    }

    [Test]
    public void SameCodeWorksForAnotherUser() {
        string code = Code(DateTime.UtcNow);

        Assert.That(Auth.ValidateTotp(NewToken(), code), Is.True);
        Assert.That(Auth.ValidateTotp(NewToken(), code), Is.True);
    }

    [Test]
    public void TokenStopsAcceptingAfterTooManyWrongCodes() {
        Auth.OtpToken token = NewToken();
        string wrong = Code(DateTime.UtcNow.AddHours(1));

        for (int i = 0; i < 5; i++) {
            Assert.That(Auth.ValidateTotp(token, wrong), Is.False);
        }

        Assert.That(Auth.ValidateTotp(token, Code(DateTime.UtcNow)), Is.False, "even the right code, the password must be entered again");
    }

    [Test]
    public void FewWrongCodesStillAllowTheRightOne() {
        Auth.OtpToken token = NewToken();
        string wrong = Code(DateTime.UtcNow.AddHours(1));

        for (int i = 0; i < 4; i++) {
            Assert.That(Auth.ValidateTotp(token, wrong), Is.False);
        }

        Assert.That(Auth.ValidateTotp(token, Code(DateTime.UtcNow)), Is.True);
    }
}
