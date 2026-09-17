using System.IO;
using System.Text;
using Renci.SshNet;

namespace Protest.Protocols;

//resolves an SSH/SFTP credential GUID (from the Vault, either a username/password credential or an
//SSH key) into authentication methods, without ever handing the caller anything but what it needs to connect
internal static class CredentialResolver {
    public static AuthenticationMethod[] Resolve(string credentialGuid, ref string username, ref string password) {
        if (String.IsNullOrEmpty(credentialGuid) || !Guid.TryParse(credentialGuid, out Guid guid)) {
            return null;
        }

        if (Tools.VaultSshKeys.FromGuid(guid, out Tools.VaultSshKeys.SshKeyEntry key)) {
            using MemoryStream stream = new MemoryStream(Encoding.UTF8.GetBytes(key.privateKey));
            PrivateKeyFile privateKeyFile = String.IsNullOrEmpty(key.passphrase)
                ? new PrivateKeyFile(stream)
                : new PrivateKeyFile(stream, key.passphrase);

            if (String.IsNullOrEmpty(username)) username = key.username;

            return new AuthenticationMethod[] { new PrivateKeyAuthenticationMethod(username, privateKeyFile) };
        }

        if (Tools.Vault.FromGuid(guid, out Tools.Vault.CredentialEntry credential)) {
            username = credential.username;
            password = credential.password;
            return new AuthenticationMethod[] { new PasswordAuthenticationMethod(username, password) };
        }

        return null;
    }
}
