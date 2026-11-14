using System.Collections.Frozen;
using System.Collections.Generic;
using System.Net;
using System.Threading.Tasks;

namespace Protest.Http;

internal static class Router {
    internal static readonly FrozenDictionary<string, Func<HttpListenerContext, string, ValueTask<byte[]>>> routes = new Dictionary<string, Func<HttpListenerContext, string, ValueTask<byte[]>>> {
        ["/logout"]                       = (ctx, username) => new(Auth.RevokeAccess(ctx, username) ? Data.CODE_OK.Array : Data.CODE_FAILED.Array),
        ["/version"]                      = (ctx, username) => new(Data.VersionToJson()),

        ["/barcode39"]                    = (ctx, username) => new(Protocols.Barcode39.GenerateSvgHandler(ctx)),
        ["/barcode128"]                   = (ctx, username) => new(Protocols.Barcode128B.GenerateSvgHandler(ctx)),

        ["/db/user/list"]                 = (ctx, username) => new(DatabaseInstances.users.Serialize(ctx)),
        ["/db/user/timeline"]             = (ctx, username) => new(DatabaseInstances.users.TimelineHandler(ctx)),
        ["/db/user/save"]                 = (ctx, username) => new(DatabaseInstances.users.SaveHandler(ctx, username)),
        ["/db/user/delete"]               = (ctx, username) => new(DatabaseInstances.users.DeleteHandler(ctx, username)),
        ["/db/user/grid"]                 = (ctx, username) => new(DatabaseInstances.users.GridHandler(ctx, username)),
        ["/db/user/attribute"]            = (ctx, username) => new(DatabaseInstances.users.AttributeValue(ctx)),

        ["/db/device/list"]               = (ctx, username) => new(DatabaseInstances.devices.Serialize(ctx)),
        ["/db/device/timeline"]           = (ctx, username) => new(DatabaseInstances.devices.TimelineHandler(ctx)),
        ["/db/device/save"]               = (ctx, username) => new(DatabaseInstances.devices.SaveHandler(ctx, username)),
        ["/db/device/delete"]             = (ctx, username) => new(DatabaseInstances.devices.DeleteHandler(ctx, username)),
        ["/db/device/grid"]               = (ctx, username) => new(DatabaseInstances.devices.GridHandler(ctx, username)),
        ["/db/device/attribute"]          = (ctx, username) => new(DatabaseInstances.devices.AttributeValue(ctx)),

        ["/vault/credential/list"]        = (ctx, username) => new(Vault.List()),
        ["/vault/credential/get"]         = (ctx, username) => new(Vault.GetSecret(ctx, username)),
        ["/vault/credential/save"]        = (ctx, username) => new(Vault.Save(ctx, username)),
        ["/vault/credential/delete"]      = (ctx, username) => new(Vault.Delete(ctx, username)),

        ["/vault/sshkey/list"]            = (ctx, username) => new(VaultSshKeys.List()),
        ["/vault/sshkey/get"]             = (ctx, username) => new(VaultSshKeys.GetSecret(ctx, username)),
        ["/vault/sshkey/save"]            = (ctx, username) => new(VaultSshKeys.Save(ctx, username)),
        ["/vault/sshkey/delete"]          = (ctx, username) => new(VaultSshKeys.Delete(ctx, username)),

        ["/vault/scan"]                   = (ctx, username) => new(VaultMigration.Scan(ctx, username)),
        ["/vault/orphans"]                = (ctx, username) => new(VaultMigration.FindOrphans()),
        ["/vault/duplicates"]             = (ctx, username) => new(VaultMigration.FindDuplicates()),
        ["/vault/deduplicate"]            = (ctx, username) => new(VaultMigration.Deduplicate(ctx, username)),
        ["/vault/users"]                  = (ctx, username) => new(Auth.ListUsernames()),

        ["/fetch/networkinfo"]            = (ctx, username) => new(Protocols.Ldap.NetworkInfo()),
        ["/fetch/integrations"]           = (ctx, username) => new(Integration.Integration.ListEnabled()),
        ["/fetch/singledevice"]           = (ctx, username) => new(Tasks.Fetch.SingleDeviceSerialize(ctx, true)),
        ["/fetch/singleuser"]             = (ctx, username) => new(Tasks.Fetch.SingleUserSerialize(ctx)),
        ["/fetch/status"]                 = (ctx, username) => new(Tasks.Fetch.Status()),
        ["/fetch/devices"]                = (ctx, username) => new(Tasks.Fetch.DevicesTask(ctx, username)),
        ["/fetch/users"]                  = (ctx, username) => new(Tasks.Fetch.UsersTask(ctx, username)),
        ["/fetch/approve"]                = (ctx, username) => new(Tasks.Fetch.ApproveLastTask(ctx, username)),
        ["/fetch/abort"]                  = (ctx, username) => new(Tasks.Fetch.CancelTask(username)),
        ["/fetch/discard"]                = (ctx, username) => new(Tasks.Fetch.DiscardLastTask(username)),
        ["/fetch/import"]                 = (ctx, username) => new(Tasks.Import.ImportTask(ctx, username)),

        ["/manage/device/wol"]            = (ctx, username) => new(Protocols.Wol.Wakeup(ctx)),
        ["/manage/device/shutdown"]       = (ctx, username) => new(OperatingSystem.IsWindows() ? Protocols.Wmi.Wmi_Win32PowerHandler(ctx, 12) : null),
        ["/manage/device/reboot"]         = (ctx, username) => new(OperatingSystem.IsWindows() ? Protocols.Wmi.Wmi_Win32PowerHandler(ctx, 6) : null),
        ["/manage/device/logoff"]         = (ctx, username) => new(OperatingSystem.IsWindows() ? Protocols.Wmi.Wmi_Win32PowerHandler(ctx, 4) : null),
        ["/manage/device/printtest"]      = (ctx, username) => new(Proprietary.Printers.Generic.PrintTestPage(ctx)),

        ["/manage/user/unlock"]           = (ctx, username) => new(OperatingSystem.IsWindows() ? Protocols.Ldap.UnlockUser(ctx, username) : null),
        ["/manage/user/enable"]           = (ctx, username) => new(OperatingSystem.IsWindows() ? Protocols.Ldap.EnableUser(ctx, username) : null),
        ["/manage/user/disable"]          = (ctx, username) => new(OperatingSystem.IsWindows() ? Protocols.Ldap.DisableUser(ctx, username) : null),

        ["/docs/list"]                    = (ctx, username) => new(Tools.Documentation.List(ctx)),
        ["/docs/create"]                  = (ctx, username) => new(Tools.Documentation.Create(ctx, username)),
        ["/docs/delete"]                  = (ctx, username) => new(Tools.Documentation.Delete(ctx, username)),
        ["/docs/view"]                    = (ctx, username) => new(Tools.Documentation.View(ctx)),

        ["/chat/history"]                 = (ctx, username) => new(Chat.GetHistory()),

        ["/debit/list"]                   = (ctx, username) => new(Tools.DebitNotes.List(ctx)),
        ["/debit/view"]                   = (ctx, username) => new(Tools.DebitNotes.View(ctx)),
        ["/debit/create"]                 = (ctx, username) => new(Tools.DebitNotes.Create(ctx, username)),
        ["/debit/delete"]                 = (ctx, username) => new(Tools.DebitNotes.Delete(ctx, username)),
        ["/debit/return"]                 = (ctx, username) => new(Tools.DebitNotes.Return(ctx, username)),
        ["/debit/templates"]              = (ctx, username) => new(Tools.DebitNotes.ListTemplate()),
        ["/debit/banners"]                = (ctx, username) => new(Tools.DebitNotes.ListBanners()),

        ["/watchdog/list"]                = (ctx, username) => new(Tasks.Watchdog.List()),
        ["/watchdog/view"]                = (ctx, username) => new(Tasks.Watchdog.View(ctx)),
        ["/watchdog/create"]              = (ctx, username) => new(Tasks.Watchdog.Create(ctx, username)),
        ["/watchdog/delete"]              = (ctx, username) => new(Tasks.Watchdog.Delete(ctx, username)),

        ["/notifications/list"]           = (ctx, username) => new(Tasks.Watchdog.ListNotifications()),
        ["/notifications/save"]           = (ctx, username) => new(Tasks.Watchdog.SaveNotifications(ctx, username)),

        ["/lifeline/ping/view"]           = (ctx, username) => new(Tasks.Lifeline.ViewPing(ctx)),
        ["/lifeline/memory/view"]         = (ctx, username) => new(Tasks.Lifeline.ViewFile(ctx, "memory")),
        ["/lifeline/cpu/view"]            = (ctx, username) => new(Tasks.Lifeline.ViewFile(ctx, "cpu")),
        ["/lifeline/disk/view"]           = (ctx, username) => new(Tasks.Lifeline.ViewFile(ctx, "disk")),
        ["/lifeline/diskio/view"]         = (ctx, username) => new(Tasks.Lifeline.ViewFile(ctx, "diskio")),
        ["/lifeline/printcount/view"]     = (ctx, username) => new(Tasks.Lifeline.ViewFile(ctx, "printcount")),
        ["/lifeline/switchcount/view"]    = (ctx, username) => new(Tasks.Lifeline.ViewFile(ctx, "switchcount")),
        ["/lifeline/switchstpchanges/view"] = (ctx, username) => new(Tasks.Lifeline.ViewFile(ctx, "switchstpchanges")),
        ["/lifeline/months"]              = (ctx, username) => new(Tasks.Lifeline.ListMonths(ctx)),
        ["/lifeline/devices"]             = (ctx, username) => new(Tasks.Lifeline.ListDevices()),

        ["/tools/bulkping"]               = (ctx, username) => new(Protocols.Icmp.BulkPing(ctx)),
        ["/tools/dnslookup"]              = (ctx, username) => new(Protocols.Dns.Resolve(ctx)),
        ["/tools/mdnslookup"]             = (ctx, username) => new(Protocols.Mdns.Resolve(ctx)),
        ["/tools/ntp"]                    = (ctx, username) => new(Protocols.Ntp.Request(ctx)),
        ["/tools/maclookup"]              = (ctx, username) => new(Tools.MacLookup.Lookup(ctx)),
        ["/tools/nics/list"]              = (ctx, username) => new(Tools.IpDiscovery.ListNics()),
        ["/serial/ports"]                 = (ctx, username) => new(Protocols.SerialCom.ListPorts()),

        ["/snmp/get"]                     = (ctx, username) => new(Protocols.Snmp.Polling.GetHandler(ctx)),
        ["/snmp/set"]                     = (ctx, username) => new(Protocols.Snmp.Polling.SetHandler(ctx)),
        ["/snmp/walk"]                    = (ctx, username) => new(Protocols.Snmp.Polling.WalkHandler(ctx)),
        ["/snmp/switchinterface"]         = (ctx, username) => new(Protocols.Snmp.Polling.GetInterfaces(ctx)),

        ["/snmptraps/list"]               = (ctx, username) => new(Protocols.Snmp.Traps.ListHandler(ctx)),
        ["/snmptraps/devices"]            = (ctx, username) => new(Protocols.Snmp.Traps.ListDevices()),
        ["/snmptraps/summary"]            = (ctx, username) => new(Protocols.LogFiles.SummaryHandler(ctx, Data.DIR_SNMP_TRAPS, 6)),
        ["/snmptraps/listeners/list"]     = (ctx, username) => new(Protocols.Snmp.Traps.List()),
        ["/snmptraps/listeners/save"]     = (ctx, username) => new(Protocols.Snmp.Traps.Save(ctx, username)),

        ["/syslog/list"]                  = (ctx, username) => new(Protocols.Syslog.ListHandler(ctx)),
        ["/syslog/devices"]               = (ctx, username) => new(Protocols.Syslog.ListDevices()),
        ["/syslog/summary"]               = (ctx, username) => new(Protocols.LogFiles.SummaryHandler(ctx, Data.DIR_SYSLOG, 8)),
        ["/syslog/listeners/list"]        = (ctx, username) => new(Protocols.Syslog.List()),
        ["/syslog/listeners/save"]        = (ctx, username) => new(Protocols.Syslog.Save(ctx, username)),

        ["/winevents/list"]               = (ctx, username) => new(Protocols.WinEvents.ListHandler(ctx)),
        ["/winevents/devices"]            = (ctx, username) => new(Protocols.WinEvents.ListDevices()),
        ["/winevents/summary"]            = (ctx, username) => new(Protocols.WinEvents.SummaryHandler(ctx)),
        ["/winevents/fetch"]              = (ctx, username) => new(Protocols.WinEvents.FetchHandlerAsync(ctx)),

        ["/sftp/download"]                = (ctx, username) => new(Protocols.Sftp.DownloadFileHandler(ctx, username)),
        ["/sftp/upload"]                  = (ctx, username) => new(Protocols.Sftp.UploadFileHandler(ctx, username)),

        ["/wmi/query"]                    = (ctx, username) => new(OperatingSystem.IsWindows() ? Protocols.Wmi.Query(ctx) : null),
        ["/wmi/killprocess"]              = (ctx, username) => new(OperatingSystem.IsWindows() ? Protocols.Wmi.WmiKillProcess(ctx) : null),

        ["/rproxy/list"]                  = (ctx, username) => new(Proxy.ReverseProxy.List()),
        ["/rproxy/create"]                = (ctx, username) => new(Proxy.ReverseProxy.Create(ctx, username)),
        ["/rproxy/delete"]                = (ctx, username) => new(Proxy.ReverseProxy.Delete(ctx, username)),
        ["/rproxy/start"]                 = (ctx, username) => new(Proxy.ReverseProxy.Start(ctx, username)),
        ["/rproxy/stop"]                  = (ctx, username) => new(Proxy.ReverseProxy.Stop(ctx, username)),

        ["/issues/start"]                 = (ctx, username) => new(Tasks.Issues.Start(username)),

        ["/rbac/list"]                    = (ctx, username) => new(Auth.ListUsers()),
        ["/rbac/create"]                  = (ctx, username) => new(Auth.CreateUser(ctx, username)),
        ["/rbac/delete"]                  = (ctx, username) => new(Auth.DeleteUser(ctx, username)),
        ["/rbac/sessions"]                = (ctx, username) => new(Auth.ListSessions()),
        ["/rbac/kickuser"]                = (ctx, username) => new(Auth.KickUser(ctx, username)),
        ["/rbac/reregistermfa"]           = (ctx, username) => new(Auth.ResetMfaSecret(ctx, username)),

        ["/scheduler/list"]               = (ctx, username) => new(Tasks.Scheduler.List()),
        ["/scheduler/save"]               = (ctx, username) => new(Tasks.Scheduler.Save(ctx, username)),
        ["/scheduler/run"]                = (ctx, username) => new(Tasks.Scheduler.Run(ctx, username)),

        ["/config/checkupdate"]           = (ctx, username) => new(Update.CheckLatestRelease()),

        ["/config/backup/list"]           = (ctx, username) => new(Backup.List()),
        ["/config/backup/create"]         = (ctx, username) => new(Backup.Create(ctx, username)),
        ["/config/backup/delete"]         = (ctx, username) => new(Backup.Delete(ctx, username)),
        ["/config/backup/download"]       = (ctx, username) => new(Backup.Download(ctx, username)),

        ["/config/zones/list"]            = (ctx, username) => new(Tools.Zones.ListZones()),
        ["/config/zones/save"]            = (ctx, username) => new(Tools.Zones.SaveZones(ctx, username)),
        ["/config/dhcprange/list"]        = (ctx, username) => new(Tools.DhcpRange.ListRange()),
        ["/config/dhcprange/save"]        = (ctx, username) => new(Tools.DhcpRange.SaveRange(ctx, username)),

        ["/config/smtpprofiles/list"]           = (ctx, username) => new(Tools.SmtpProfiles.List()),
        ["/config/smtpprofiles/save"]           = (ctx, username) => new(Tools.SmtpProfiles.Save(ctx, username)),
        ["/config/smtpprofiles/test"]           = (ctx, username) => new(Tools.SmtpProfiles.SendTest(ctx)),
        ["/config/smtpprofiles/oauth/start"]    = (ctx, username) => new(Tools.SmtpOAuth.Start(ctx)),
        ["/config/smtpprofiles/oauth/poll"]     = (ctx, username) => new(Tools.SmtpOAuth.Poll(ctx)),
        ["/config/smtpprofiles/oauth/complete"] = (ctx, username) => new(Tools.SmtpOAuth.Complete(ctx)),

        ["/config/snmpprofiles/list"]     = (ctx, username) => new(Tools.SnmpProfiles.List(ctx)),
        ["/config/snmpprofiles/save"]     = (ctx, username) => new(Tools.SnmpProfiles.Save(ctx, username)),

        ["/config/integration/types"]     = (ctx, username) => new(Integration.Integration.GetTypes()),
        ["/config/integration/list"]      = (ctx, username) => new(Integration.Integration.List()),
        ["/config/integration/get"]       = (ctx, username) => new(Integration.Integration.Get(ctx)),
        ["/config/integration/save"]      = (ctx, username) => new(Integration.Integration.Save(ctx, username)),
        ["/config/integration/delete"]    = (ctx, username) => new(Integration.Integration.Delete(ctx, username)),
        ["/config/integration/test"]      = (ctx, username) => new(Integration.Integration.Test(ctx, username)),

        ["/config/cert/list"]             = (ctx, username) => new(Tools.Cert.List()),
        ["/config/cert/create"]           = (ctx, username) => new(Tools.Cert.Create(ctx, username)),
        ["/config/cert/delete"]           = (ctx, username) => new(Tools.Cert.Delete(ctx, username)),
        ["/config/cert/info"]             = (ctx, username) => new(Tools.Cert.GetCertInfo(ctx)),
        ["/config/cert/upload"]           = (ctx, username) => new(Tools.Cert.Upload(ctx, username)),
        ["/config/cert/download"]         = (ctx, username) => new(Tools.Cert.Download(ctx, username)),

        ["/config/dataretention/lifeline"]       = (ctx, username) => new(DataRetention.Handler(ctx, username, "lifeline")),
        ["/config/dataretention/lastseen"]       = (ctx, username) => new(DataRetention.Handler(ctx, username, "lastseen")),
        ["/config/dataretention/watchdog"]       = (ctx, username) => new(DataRetention.Handler(ctx, username, "watchdog")),
        ["/config/dataretention/recordings"]     = (ctx, username) => new(DataRetention.Handler(ctx, username, "recordings")),
        ["/config/dataretention/logs"]           = (ctx, username) => new(DataRetention.Handler(ctx, username, "logs")),
        ["/config/dataretention/syslog"]         = (ctx, username) => new(DataRetention.Handler(ctx, username, "syslog")),
        ["/config/dataretention/snmptraps"]      = (ctx, username) => new(DataRetention.Handler(ctx, username, "snmptraps")),
        ["/config/dataretention/winevents"]      = (ctx, username) => new(DataRetention.Handler(ctx, username, "winevents")),
        ["/config/dataretention/devicetimeline"] = (ctx, username) => new(DataRetention.Handler(ctx, username, "devicetimeline")),
        ["/config/dataretention/usertimeline"]   = (ctx, username) => new(DataRetention.Handler(ctx, username, "usertimeline")),

        ["/config/dataretention/settings/list"]  = (ctx, username) => new(DataRetention.ListSettings()),
        ["/config/dataretention/settings/save"]  = (ctx, username) => new(DataRetention.SaveSettings(ctx, username)),

        ["/config/sessionrecording/get"]  = (ctx, username) => new(Protocols.SessionRecording.GetSettings()),
        ["/config/sessionrecording/save"] = (ctx, username) => new(Protocols.SessionRecording.SaveSettings(ctx, username)),

        ["/config/rustdesk/get"]          = (ctx, username) => new(Protocols.RustDesk.GetServerSettings()),
        ["/config/rustdesk/save"]         = (ctx, username) => new(Protocols.RustDesk.SaveServerSettings(ctx, username)),

        ["/api/list"]                     = (ctx, username) => new(Tools.Api.List()),
        ["/api/save"]                     = (ctx, username) => new(Tools.Api.Save(ctx, username)),

        ["/log/list"]                     = (ctx, username) => new(Logger.List(ctx)),

        ["/recordings/list"]              = (ctx, username) => new(Protocols.SessionRecording.ListHandler(ctx)),
        ["/recordings/meta"]              = (ctx, username) => new(Protocols.SessionRecording.MetaHandler(ctx))
    }.ToFrozenDictionary();
}
