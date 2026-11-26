using Protest.Http;

namespace Protest.Tests;

internal class MultipartFileHelperTests {
    [TestCase(true)]
    [TestCase(false)]
    public async Task ReadAsync_PreservesCertificateBytesAndLeadingPasswordBom(bool passwordFirst) {
        const string password = "\uFEFF passw\u00F6rd ";
        byte[] certificate = [0x00, 0xFF, 0x0D, 0x0A];
        using MultipartFormDataContent form = new MultipartFormDataContent();
        if (passwordFirst) form.Add(new StringContent(password), "password");
        form.Add(new ByteArrayContent(certificate), "file", "test.pfx");
        if (!passwordFirst) form.Add(new StringContent(password), "password");

        using Stream stream = await form.ReadAsStreamAsync();
        MultipartFileHelper.Upload upload = await MultipartFileHelper.ReadAsync(stream, form.Headers.ContentType!.ToString());

        Assert.That(upload, Is.Not.Null);
        Assert.Multiple(() => {
            Assert.That(upload.Filename, Is.EqualTo("test.pfx"));
            Assert.That(upload.Content, Is.EqualTo(certificate));
            Assert.That(upload.Fields["password"], Is.EqualTo(password));
        });
    }
}
