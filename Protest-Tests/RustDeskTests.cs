using System.Net;
using System.Security.Cryptography;
using System.Text;
using Org.BouncyCastle.Math.EC.Rfc7748;
using Protest.Protocols;

namespace Protest.Tests;

public class RustDeskTests {
    private static byte[] Hex(string hex) => Convert.FromHexString(hex);

    //RFC 7748's key pairs, the box vectors come from libsodium (PyNaCl)
    private static readonly byte[] ALICE_SK = Hex("77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a");
    private static readonly byte[] BOB_SK   = Hex("5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb");
    private static readonly byte[] ALICE_PK = Hex("8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a");
    private static readonly byte[] BOB_PK   = Hex("de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f");

    private static byte[] Fill(byte value, int count) => Enumerable.Repeat(value, count).ToArray();

    [Test]
    public void Cipher_FirstMessage_MatchesRustDeskWireVector() {
        //hbb_common's tcp.rs pins this frame, what released peers send
        RustDesk.Cipher cipher = new RustDesk.Cipher(Fill(0x11, 32), Fill(0x11, 32));

        byte[] sealedBox = cipher.Seal("hello"u8);

        Assert.That(Convert.ToHexStringLower(sealedBox), Is.EqualTo("3b768f827fdcc4af555b9e42533be6611e2c333481"));
    }

    [Test]
    public void Cipher_SealThenOpen_CountsEachDirectionApart() {
        byte[] key = Fill(0x22, 32);
        RustDesk.Cipher a = new RustDesk.Cipher(key, key);
        RustDesk.Cipher b = new RustDesk.Cipher(key, key);

        byte[] first = a.Seal("one"u8);
        byte[] second = a.Seal("two"u8);

        Assert.That(first, Is.Not.EqualTo(a.Seal("one"u8)), "every message takes the next nonce");
        Assert.That(b.Open(first), Is.EqualTo("one"u8.ToArray()));
        Assert.That(b.Open(second), Is.EqualTo("two"u8.ToArray()));
    }

    [Test]
    public void Cipher_Open_RejectsTamperedBox() {
        byte[] key = Fill(0x33, 32);
        byte[] sealedBox = new RustDesk.Cipher(key, key).Seal("hello"u8);
        sealedBox[^1] ^= 1;

        Assert.That(new RustDesk.Cipher(key, key).Open(sealedBox), Is.Null);
    }

    [Test]
    public void BeforeNm_Rfc7748Keys_MatchesNaClFirstKey() {
        Assert.That(Convert.ToHexStringLower(RustDesk.NaCl.BeforeNm(BOB_PK, ALICE_SK)),
            Is.EqualTo("1b27556473e985d462cd51197a9a46c76009549eac6474f206c4ee0844f68389"));
        Assert.That(RustDesk.NaCl.BeforeNm(ALICE_PK, BOB_SK), Is.EqualTo(RustDesk.NaCl.BeforeNm(BOB_PK, ALICE_SK)));
    }

    [Test]
    public void Box_MatchesLibsodium() {
        byte[] box = RustDesk.NaCl.Box(Fill(0x44, 32), new byte[24], BOB_PK, ALICE_SK);

        Assert.That(Convert.ToHexStringLower(box),
            Is.EqualTo("b74f9c589f8bfc686c83c83ed8289b24429466232c875a806d786fa29d877d1ae06ab556917fafb44a07d03b8da46179"));
        Assert.That(RustDesk.NaCl.BoxOpen(box, new byte[24], ALICE_PK, BOB_SK), Is.EqualTo(Fill(0x44, 32)));
    }

    [Test]
    public void DeriveSubkey_MatchesRustDeskWireVectors() {
        //hbb_common's tcp.rs pins these, hbbs carries its own copy of the derivation
        byte[] key = Fill(0x11, 32);
        byte[] initiator = Fill(0x22, 32);
        byte[] responder = Fill(0x33, 32);

        Assert.That(Convert.ToHexStringLower(RustDesk.DeriveSubkey(key, 1, 1, 1, initiator, responder)),
            Is.EqualTo("c189ec6e1935c0751cfc85a0f075405cae507d7925bb19687caf56cbb54e0ecf"));
        Assert.That(Convert.ToHexStringLower(RustDesk.DeriveSubkey(key, 2, 1, 1, initiator, responder)),
            Is.EqualTo("8a62648e9195cb10ea900c0a24d2a166c1e982347a2dc6833c3e756bf5715d36"));
        Assert.That(Convert.ToHexStringLower(RustDesk.DeriveSubkey(key, 1, 3, 1, initiator, responder)),
            Is.EqualTo("25b0778ae600f9731c7fa457d1cc5d40071b0aa3d34c90b53e1d5344b0e7123a"));
        Assert.That(Convert.ToHexStringLower(RustDesk.DeriveSubkey(key, 2, 3, 1, initiator, responder)),
            Is.EqualTo("5bbde0ac6a708d4cd1ff807125d79cb6030bde62f7a66b6cc1a79e31bd657756"));
    }

    //a SignedId as a host sends it, the signature isn't checked so any 64 bytes do
    private static byte[] SignedId(string id, byte[] pk, uint kxVersion) {
        byte[] idPk = new RustDesk.ProtoWriter().String(1, id).Bytes(2, pk).Varint(4, kxVersion).ToArray();
        return new byte[64].Concat(idPk).ToArray();
    }

    private static (byte[] asymmetric, byte[] symmetric, uint kxVersion) DecodePublicKey(byte[] message) {
        RustDesk.ProtoReader reader = new RustDesk.ProtoReader(message);
        Assert.That(reader.Next(), Is.True);
        Assert.That(reader.Field, Is.EqualTo(RustDesk.PUBLIC_KEY));

        byte[] asymmetric = null!, symmetric = null!;
        uint kxVersion = 0;
        RustDesk.ProtoReader publicKey = reader.Nested();
        while (publicKey.Next()) {
            switch (publicKey.Field) {
            case 1: asymmetric = publicKey.Bytes(); break;
            case 2: symmetric = publicKey.Bytes(); break;
            case 3: kxVersion = (uint)publicKey.Value; break;
            }
        }
        return (asymmetric, symmetric, kxVersion);
    }

    [TestCase(1u)]
    [TestCase(7u)]
    public void KeyExchange_HostSpeaksVersion1_KeysEachDirectionApart(uint advertised) {
        byte[] hostSk = RandomNumberGenerator.GetBytes(32);
        byte[] hostPk = new byte[32];
        X25519.GeneratePublicKey(hostSk, 0, hostPk, 0);

        Assert.That(RustDesk.TryCreateKeyExchange(SignedId("123456789", hostPk, advertised), out string peerId, out byte[] reply, out RustDesk.Cipher gateway), Is.True);
        Assert.That(peerId, Is.EqualTo("123456789"));

        (byte[] gatewayPk, byte[] sealedKey, uint picked) = DecodePublicKey(reply);
        Assert.That(picked, Is.EqualTo(RustDesk.KX_VERSION_LATEST), "the highest both sides speak");

        //the host opens the sealed key and splits it as the responder
        byte[] key = RustDesk.NaCl.BoxOpen(sealedKey, new byte[24], gatewayPk, hostSk);
        Assert.That(key, Has.Length.EqualTo(32));

        RustDesk.Cipher host = new RustDesk.Cipher(
            RustDesk.DeriveSubkey(key, 2, advertised, picked, gatewayPk, hostPk),
            RustDesk.DeriveSubkey(key, 1, advertised, picked, gatewayPk, hostPk));

        Assert.That(host.Open(gateway.Seal("to host"u8)), Is.EqualTo("to host"u8.ToArray()));
        Assert.That(gateway.Open(host.Seal("to gateway"u8)), Is.EqualTo("to gateway"u8.ToArray()));
    }

    [Test]
    public void KeyExchange_LegacyHost_UsesOneKeyForBothDirections() {
        byte[] hostSk = RandomNumberGenerator.GetBytes(32);
        byte[] hostPk = new byte[32];
        X25519.GeneratePublicKey(hostSk, 0, hostPk, 0);

        Assert.That(RustDesk.TryCreateKeyExchange(SignedId("987654321", hostPk, 0), out _, out byte[] reply, out RustDesk.Cipher gateway), Is.True);

        (byte[] gatewayPk, byte[] sealedKey, uint picked) = DecodePublicKey(reply);
        Assert.That(picked, Is.Zero);

        byte[] key = RustDesk.NaCl.BoxOpen(sealedKey, new byte[24], gatewayPk, hostSk);
        RustDesk.Cipher host = new RustDesk.Cipher(key, key);

        Assert.That(host.Open(gateway.Seal("hello"u8)), Is.EqualTo("hello"u8.ToArray()));
        Assert.That(gateway.Open(host.Seal("hello"u8)), Is.EqualTo("hello"u8.ToArray()));
    }

    [Test]
    public void KeyExchange_InvalidSignedId_IsRefused() {
        Assert.That(RustDesk.TryCreateKeyExchange(new byte[64], out _, out _, out _), Is.False, "no IdPk past the signature");
        Assert.That(RustDesk.TryCreateKeyExchange(SignedId("1", new byte[31], 1), out _, out _, out _), Is.False, "a public key of the wrong length");
        Assert.That(RustDesk.TryCreateKeyExchange(new byte[64].Concat(new byte[] { 0x0a, 0x7f }).ToArray(), out _, out _, out _), Is.False, "a truncated IdPk");
    }

    [TestCase(0)]
    [TestCase(0x3F)]
    [TestCase(0x40)]
    [TestCase(0x3FFF)]
    [TestCase(0x4000)]
    [TestCase(0x40_0000)]
    public void Frame_RoundTripsThroughConnection(int length) {
        byte[] payload = RandomNumberGenerator.GetBytes(length);
        byte[] frame = RustDesk.Connection.Frame(payload);

        int expectedHeader = length <= 0x3F ? 1 : length <= 0x3FFF ? 2 : length <= 0x3F_FFFF ? 3 : 4;
        Assert.That(frame, Has.Length.EqualTo(expectedHeader + length));
        Assert.That(frame[0] & 0x03, Is.EqualTo(expectedHeader - 1));

        RustDesk.Connection connection = new RustDesk.Connection(new MemoryStream(frame));
        Assert.That(connection.ReceiveAsync(CancellationToken.None).GetAwaiter().GetResult(), Is.EqualTo(payload));
    }

    [Test]
    public void Frame_MatchesBytesCodecHeader() {
        //hbb_common's BytesCodec writes the length shifted by two, the header length less one below it, little-endian
        Assert.That(RustDesk.Connection.Frame(new byte[0x3F])[0], Is.EqualTo(0xFC));
        Assert.That(RustDesk.Connection.Frame(new byte[0x40])[..2], Is.EqualTo(new byte[] { 0x01, 0x01 }));
        Assert.That(RustDesk.Connection.Frame(new byte[0x4000])[..3], Is.EqualTo(new byte[] { 0x02, 0x00, 0x01 }));
    }

    [Test]
    public void Connection_Encrypted_DecryptsEveryMessageButHeartbeats() {
        byte[] key = Fill(0x55, 32);
        RustDesk.Cipher host = new RustDesk.Cipher(key, key);

        using MemoryStream stream = new MemoryStream();
        stream.Write(RustDesk.Connection.Frame(host.Seal("first"u8)));
        stream.Write(RustDesk.Connection.Frame(new byte[] { 0 }));
        stream.Write(RustDesk.Connection.Frame(host.Seal("second"u8)));
        stream.Position = 0;

        RustDesk.Connection connection = new RustDesk.Connection(stream);
        connection.SetCipher(new RustDesk.Cipher(key, key));

        Assert.That(connection.ReceiveAsync(CancellationToken.None).GetAwaiter().GetResult(), Is.EqualTo("first"u8.ToArray()));
        Assert.That(connection.ReceiveAsync(CancellationToken.None).GetAwaiter().GetResult(), Is.EqualTo(new byte[] { 0 }));
        Assert.That(connection.ReceiveAsync(CancellationToken.None).GetAwaiter().GetResult(), Is.EqualTo("second"u8.ToArray()));
    }

    [Test]
    public void Connection_OversizedFrame_IsRefused() {
        byte[] header = BitConverter.GetBytes((uint)(64 * 1024 * 1024) << 2 | 3);
        RustDesk.Connection connection = new RustDesk.Connection(new MemoryStream(header));

        Assert.ThrowsAsync<InvalidDataException>(() => connection.ReceiveAsync(CancellationToken.None));
    }

    [Test]
    public void HashPassword_IsSha256OfSaltedHashAndChallenge() {
        byte[] h1 = SHA256.HashData(Encoding.UTF8.GetBytes("secretsalt"));
        byte[] expected = SHA256.HashData(h1.Concat(Encoding.UTF8.GetBytes("challenge")).ToArray());

        Assert.That(RustDesk.HashPassword("secret", "salt", "challenge"), Is.EqualTo(expected));
        Assert.That(RustDesk.HashPassword(null!, "salt", "challenge"), Is.Empty, "no password lets the remote user accept");
        Assert.That(RustDesk.HashPassword("", "salt", "challenge"), Is.Empty);
    }

    [Test]
    public void EncodeLogin_CarriesDirectAccessNameAndVideoAcknowledgement() {
        RustDesk.ClientHello hello = new RustDesk.ClientHello { av1 = true, clipboard = false };
        byte[] message = RustDesk.EncodeLogin("192.168.1.20", "secret", "salt", "challenge", 42, "admin", hello);

        RustDesk.ProtoReader reader = new RustDesk.ProtoReader(message);
        Assert.That(reader.Next(), Is.True);
        Assert.That(reader.Field, Is.EqualTo(RustDesk.LOGIN_REQUEST));

        string username = null!, name = null!, platform = null!;
        byte[] password = null!;
        ulong videoAck = 0, sessionId = 0;
        RustDesk.ProtoReader option = null!;

        RustDesk.ProtoReader login = reader.Nested();
        while (login.Next()) {
            switch (login.Field) {
            case 1:  username = login.String(); break;
            case 2:  password = login.Bytes(); break;
            case 5:  name = login.String(); break;
            case 6:  option = login.Nested(); break;
            case 9:  videoAck = login.Value; break;
            case 10: sessionId = login.Value; break;
            case 13: platform = login.String(); break;
            }
        }

        Assert.That(login.Failed, Is.False);
        Assert.That(username, Is.EqualTo("192.168.1.20"));
        Assert.That(password, Is.EqualTo(RustDesk.HashPassword("secret", "salt", "challenge")));
        Assert.That(name, Is.EqualTo("admin"));
        Assert.That(videoAck, Is.EqualTo(1));
        Assert.That(sessionId, Is.EqualTo(42));
        Assert.That(platform, Is.EqualTo("Web"));

        ulong disableClipboard = 0, disableAudio = 0, vp9 = 0, av1 = 0, h264 = 0;
        while (option.Next()) {
            if (option.Field == 7) disableAudio = option.Value;
            if (option.Field == 8) disableClipboard = option.Value;
            if (option.Field == 10) {
                RustDesk.ProtoReader decoding = option.Nested();
                while (decoding.Next()) {
                    if (decoding.Field == 1) vp9 = decoding.Value;
                    if (decoding.Field == 2) h264 = decoding.Value;
                    if (decoding.Field == 6) av1 = decoding.Value;
                }
            }
        }

        Assert.That(disableClipboard, Is.EqualTo(2), "yes, until the window turns clipboard sync on");
        Assert.That(disableAudio, Is.EqualTo(2));
        Assert.That(vp9, Is.EqualTo(1));
        Assert.That(av1, Is.EqualTo(1));
        Assert.That(h264, Is.Zero);
    }

    private static byte[] Message(int field, RustDesk.ProtoWriter inner) => new RustDesk.ProtoWriter().Message(field, inner).ToArray();

    private static byte[] Mouse(int mask) => Message(RustDesk.MOUSE_EVENT, new RustDesk.ProtoWriter().Varint(1, (ulong)mask).Varint(2, 100).Varint(3, 200));

    [Test]
    public void IsAllowedClientMessage_PointerMove_IsAllowedWithoutInteraction() {
        Assert.That(RustDesk.IsAllowedClientMessage(Mouse(0), out bool interaction), Is.True);
        Assert.That(interaction, Is.False);
    }

    [TestCase(1 << 3 | 1)] //left button down
    [TestCase(1 << 3 | 2)] //left button up
    [TestCase(3)]          //wheel
    public void IsAllowedClientMessage_ClicksAndWheel_AreInteraction(int mask) {
        Assert.That(RustDesk.IsAllowedClientMessage(Mouse(mask), out bool interaction), Is.True);
        Assert.That(interaction, Is.True);
    }

    [Test]
    public void IsAllowedClientMessage_KeyEvent_IsInteraction() {
        byte[] key = Message(RustDesk.KEY_EVENT, new RustDesk.ProtoWriter().Bool(1, true).Varint(4, 0x1E).Varint(9, 1));

        Assert.That(RustDesk.IsAllowedClientMessage(key, out bool interaction), Is.True);
        Assert.That(interaction, Is.True);
    }

    [Test]
    public void IsAllowedClientMessage_VideoControls_AreAllowed() {
        Assert.That(RustDesk.IsAllowedClientMessage(Message(RustDesk.MISC, new RustDesk.ProtoWriter().Bool(12, true)), out _), Is.True, "video_received");
        Assert.That(RustDesk.IsAllowedClientMessage(Message(RustDesk.MISC, new RustDesk.ProtoWriter().Bool(10, true)), out _), Is.True, "refresh_video");
    }

    [Test]
    public void IsAllowedClientMessage_RestartRemoteDevice_IsRefused() {
        Assert.That(RustDesk.IsAllowedClientMessage(Message(RustDesk.MISC, new RustDesk.ProtoWriter().Bool(14, true)), out _), Is.False);
    }

    [TestCase(RustDesk.LOGIN_REQUEST)]
    [TestCase(17)] //file_action
    [TestCase(RustDesk.PUBLIC_KEY)]
    public void IsAllowedClientMessage_SessionChanges_AreRefused(int field) {
        Assert.That(RustDesk.IsAllowedClientMessage(Message(field, new RustDesk.ProtoWriter().String(1, "x")), out _), Is.False);
    }

    [Test]
    public void IsAllowedClientMessage_SecondUnionMember_IsRefused() {
        //the host's parser takes the last member of the union, an allowed one ahead of it must not let it through
        byte[] smuggled = Mouse(0).Concat(Message(RustDesk.LOGIN_REQUEST, new RustDesk.ProtoWriter().String(1, "x"))).ToArray();

        Assert.That(RustDesk.IsAllowedClientMessage(smuggled, out _), Is.False);
    }

    [Test]
    public void IsAllowedClientMessage_Malformed_IsRefused() {
        Assert.That(RustDesk.IsAllowedClientMessage(Array.Empty<byte>(), out _), Is.False);
        Assert.That(RustDesk.IsAllowedClientMessage(new byte[] { 0x52, 0x10, 0x08 }, out _), Is.False, "a length past the end");
    }

    [TestCase("10.0.0.5", "10.0.0.5", 21118)]
    [TestCase("10.0.0.5:21200", "10.0.0.5", 21200)]
    [TestCase("pc01", "pc01", 21118)]
    [TestCase("[fe80::1]:21200", "fe80::1", 21200)]
    [TestCase("fe80::1", "fe80::1", 21118)]
    public void ParseTarget_DefaultsToDirectAccessPort(string target, string host, int port) {
        Assert.That(Ssh.ParseTarget(target, RustDesk.DEFAULT_PORT), Is.EqualTo((host, port)));
    }

    [Test]
    public void GetDirectAccessName_IsTheBareAddress() {
        Assert.That(RustDesk.GetDirectAccessName(new IPEndPoint(IPAddress.Parse("::ffff:192.168.1.20"), 21118)), Is.EqualTo("192.168.1.20"));
        Assert.That(RustDesk.GetDirectAccessName(new IPEndPoint(IPAddress.Parse("fe80::1%4"), 21118)), Is.EqualTo("fe80::1"));
    }

    [Test]
    public void ParseHello_ReadsCodecsPasswordAndClipboard() {
        RustDesk.ClientHello hello = RustDesk.ParseHello("{\"codecs\":[\"vp9\",\"av1\",\"h264\"],\"password\":\"pw\",\"clipboard\":true}");

        Assert.That(hello, Is.Not.Null);
        Assert.That(hello.av1 && hello.h264 && !hello.vp8 && !hello.h265, Is.True);
        Assert.That(hello.password, Is.EqualTo("pw"));
        Assert.That(hello.clipboard, Is.True);

        Assert.That(RustDesk.ParseHello("not json"), Is.Null);
        Assert.That(RustDesk.ParseHello("{\"codecs\":[1]}"), Is.Null);
    }
}
