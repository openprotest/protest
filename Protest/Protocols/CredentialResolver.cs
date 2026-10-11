using System.IO;
using System.Text;
using Renci.SshNet;

namespace Protest.Protocols;

internal static class CredentialResolver {
    public static AuthenticationMethod[] Resolve(string credentialGuid, ref string username, ref string password, string requestingUser, out bool permissionDenied) {
        permissionDenied = false;

        if (String.IsNullOrEmpty(credentialGuid) || !Guid.TryParse(credentialGuid, out Guid guid)) {
            return null;
        }

        if (VaultSshKeys.FromGuid(guid, out VaultSshKeys.SshKeyEntry key)) {
            if (!VaultSshKeys.IsAllowed(key, requestingUser)) {
                permissionDenied = true;
                return null;
            }

            using MemoryStream stream = new MemoryStream(Encoding.UTF8.GetBytes(key.privateKey));
            PrivateKeyFile privateKeyFile = String.IsNullOrEmpty(key.passphrase)
                ? new PrivateKeyFile(stream)
                : new PrivateKeyFile(stream, key.passphrase);

            if (String.IsNullOrEmpty(username)) username = key.username;

            return new AuthenticationMethod[] { new PrivateKeyAuthenticationMethod(username, privateKeyFile) };
        }

        if (Vault.FromGuid(guid, out Vault.CredentialEntry credential)) {
            if (!Vault.IsAllowed(credential, requestingUser)) {
                permissionDenied = true;
                return null;
            }

            username = credential.username;
            password = credential.password;
            return new AuthenticationMethod[] { new PasswordAuthenticationMethod(username, password) };
        }

        return null;
    }
}
