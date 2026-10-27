using System.IO;
using System.Text;
using Renci.SshNet;
using Renci.SshNet.Common;

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
            return FromPassword(username, password);
        }

        return null;
    }

    //offer keyboard-interactive alongside password: hosts with "PasswordAuthentication no" often still accept
    //the same password through keyboard-interactive (PAM). the client only tries methods the host allows
    public static AuthenticationMethod[] FromPassword(string username, string password) {
        KeyboardInteractiveAuthenticationMethod keyboardInteractive = new KeyboardInteractiveAuthenticationMethod(username);
        keyboardInteractive.AuthenticationPrompt += (sender, e) => {
            foreach (AuthenticationPrompt prompt in e.Prompts) {
                //hidden prompts are password prompts, echoed ones (OTP, etc.) can't be answered unattended
                prompt.Response = prompt.IsEchoed ? String.Empty : password;
            }
        };

        return new AuthenticationMethod[] { new PasswordAuthenticationMethod(username, password), keyboardInteractive };
    }
}
