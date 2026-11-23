using System.Collections.Frozen;
using System.Collections.Generic;
using System.Net;
using System.Threading.Tasks;

namespace Protest.Http;

internal static class Router {
    internal readonly record struct Route(Func<HttpListenerContext, string, ValueTask<byte[]>> Handler, string RequiredMethod = null, bool StreamsResponse = false);

    internal static readonly FrozenDictionary<string, Route> routes = new Dictionary<string, Route> {
        ["/logout"]                              = new Route((ctx, username) => new(Auth.RevokeAccess(ctx, username) ? Data.CODE_OK.Array : Data.CODE_FAILED.Array), "POST"),
        ["/version"]                             = new Route((ctx, username) => new(Data.VersionToJson())),

        ["/barcode39"]                           = new Route((ctx, username) => new(Protocols.Barcode39.GenerateSvgHandler(ctx))),
        ["/barcode128"]                          = new Route((ctx, username) => new(Protocols.Barcode128B.GenerateSvgHandler(ctx))),

        ["/db/user/list"]                        = new Route((ctx, username) => new(DatabaseInstances.users.Serialize(ctx))),
        ["/db/user/timeline"]                    = new Route((ctx, username) => new(DatabaseInstances.users.TimelineHandler(ctx))),
        ["/db/user/save"]                        = new Route((ctx, username) => new(DatabaseInstances.users.SaveHandler(ctx, username)), "POST"),
        ["/db/user/delete"]                      = new Route((ctx, username) => new(DatabaseInstances.users.DeleteHandler(ctx, username)), "DELETE"),
        ["/db/user/grid"]                        = new Route((ctx, username) => new(DatabaseInstances.users.GridHandler(ctx, username)), "POST"),
        ["/db/user/attribute"]                   = new Route((ctx, username) => new(DatabaseInstances.users.AttributeValue(ctx))),

        ["/db/device/list"]                      = new Route((ctx, username) => new(DatabaseInstances.devices.Serialize(ctx))),
        ["/db/device/timeline"]                  = new Route((ctx, username) => new(DatabaseInstances.devices.TimelineHandler(ctx))),
        ["/db/device/save"]                      = new Route((ctx, username) => new(DatabaseInstances.devices.SaveHandler(ctx, username)), "POST"),
        ["/db/device/delete"]                    = new Route((ctx, username) => new(DatabaseInstances.devices.DeleteHandler(ctx, username)), "DELETE"),
        ["/db/device/grid"]                      = new Route((ctx, username) => new(DatabaseInstances.devices.GridHandler(ctx, username)), "POST"),
        ["/db/device/attribute"]                 = new Route((ctx, username) => new(DatabaseInstances.devices.AttributeValue(ctx))),

        ["/vault/credential/list"]               = new Route((ctx, username) => new(Vault.List())),
        ["/vault/credential/get"]                = new Route((ctx, username) => new(Vault.GetSecret(ctx))),
        ["/vault/credential/save"]               = new Route((ctx, username) => new(Vault.Save(ctx, username)), "POST"),
        ["/vault/credential/delete"]             = new Route((ctx, username) => new(Vault.Delete(ctx, username)), "POST"),

        ["/vault/sshkey/list"]                   = new Route((ctx, username) => new(VaultSshKeys.List())),
        ["/vault/sshkey/get"]                    = new Route((ctx, username) => new(VaultSshKeys.GetSecret(ctx))),
        ["/vault/sshkey/save"]                   = new Route((ctx, username) => new(VaultSshKeys.Save(ctx, username)), "POST"),
        ["/vault/sshkey/delete"]                 = new Route((ctx, username) => new(VaultSshKeys.Delete(ctx, username)), "POST"),

        ["/vault/scan"]                          = new Route((ctx, username) => new(VaultMigration.Scan(ctx, username)), "POST"),
        ["/vault/orphans"]                       = new Route((ctx, username) => new(VaultMigration.FindOrphans())),
        ["/vault/duplicates"]                    = new Route((ctx, username) => new(VaultMigration.FindDuplicates())),
        ["/vault/deduplicate"]                   = new Route((ctx, username) => new(VaultMigration.Deduplicate(ctx, username)), "POST"),

        ["/fetch/networkinfo"]                   = new Route((ctx, username) => new(Protocols.Ldap.NetworkInfo())),
        ["/fetch/integrations"]                  = new Route((ctx, username) => new(Integration.Integration.ListEnabled())),
        ["/fetch/singledevice"]                  = new Route((ctx, username) => new(Tasks.Fetch.SingleDeviceSerialize(ctx, true))),
        ["/fetch/singleuser"]                    = new Route((ctx, username) => new(Tasks.Fetch.SingleUserSerialize(ctx))),
        ["/fetch/status"]                        = new Route((ctx, username) => new(Tasks.Fetch.Status())),
        ["/fetch/devices"]                       = new Route((ctx, username) => new(Tasks.Fetch.DevicesTask(ctx, username)), "POST"),
        ["/fetch/users"]                         = new Route((ctx, username) => new(Tasks.Fetch.UsersTask(ctx, username)), "POST"),
        ["/fetch/approve"]                       = new Route((ctx, username) => new(Tasks.Fetch.ApproveLastTask(ctx, username)), "POST"),
        ["/fetch/abort"]                         = new Route((ctx, username) => new(Tasks.Fetch.CancelTask(username)), "POST"),
        ["/fetch/discard"]                       = new Route((ctx, username) => new(Tasks.Fetch.DiscardLastTask(username)), "POST"),
        ["/fetch/import"]                        = new Route((ctx, username) => new(Tasks.Import.ImportTask(ctx, username)), "POST"),

        ["/manage/device/wol"]                   = new Route((ctx, username) => new(Protocols.Wol.Wakeup(ctx)), "POST"),
        ["/manage/device/shutdown"]              = new Route((ctx, username) => new(OperatingSystem.IsWindows() ? Protocols.Wmi.Wmi_Win32PowerHandler(ctx, 12) : null), "POST"),
        ["/manage/device/reboot"]                = new Route((ctx, username) => new(OperatingSystem.IsWindows() ? Protocols.Wmi.Wmi_Win32PowerHandler(ctx, 6) : null), "POST"),
        ["/manage/device/logoff"]                = new Route((ctx, username) => new(OperatingSystem.IsWindows() ? Protocols.Wmi.Wmi_Win32PowerHandler(ctx, 4) : null), "POST"),
        ["/manage/device/printtest"]             = new Route((ctx, username) => new(Proprietary.Printers.Generic.PrintTestPage(ctx)), "POST"),

        ["/manage/user/unlock"]                  = new Route((ctx, username) => new(OperatingSystem.IsWindows() ? Protocols.Ldap.UnlockUser(ctx, username) : null), "POST"),
        ["/manage/user/enable"]                  = new Route((ctx, username) => new(OperatingSystem.IsWindows() ? Protocols.Ldap.EnableUser(ctx, username) : null), "POST"),
        ["/manage/user/disable"]                 = new Route((ctx, username) => new(OperatingSystem.IsWindows() ? Protocols.Ldap.DisableUser(ctx, username) : null), "POST"),

        ["/docs/list"]                           = new Route((ctx, username) => new(Tools.Documentation.List(ctx))),
        ["/docs/create"]                         = new Route((ctx, username) => new(Tools.Documentation.Create(ctx, username)), "POST"),
        ["/docs/delete"]                         = new Route((ctx, username) => new(Tools.Documentation.Delete(ctx, username)), "POST"),
        ["/docs/view"]                           = new Route((ctx, username) => new(Tools.Documentation.View(ctx))),

        ["/chat/history"]                        = new Route((ctx, username) => new(Chat.GetHistory())),

        ["/debit/list"]                          = new Route((ctx, username) => new(Tools.DebitNotes.List(ctx))),
        ["/debit/view"]                          = new Route((ctx, username) => new(Tools.DebitNotes.View(ctx))),
        ["/debit/create"]                        = new Route((ctx, username) => new(Tools.DebitNotes.Create(ctx, username)), "POST"),
        ["/debit/delete"]                        = new Route((ctx, username) => new(Tools.DebitNotes.Delete(ctx, username)), "POST"),
        ["/debit/return"]                        = new Route((ctx, username) => new(Tools.DebitNotes.Return(ctx, username)), "POST"),
        ["/debit/templates"]                     = new Route((ctx, username) => new(Tools.DebitNotes.ListTemplate())),
        ["/debit/banners"]                       = new Route((ctx, username) => new(Tools.DebitNotes.ListBanners())),

        ["/watchdog/list"]                       = new Route((ctx, username) => new(Tasks.Watchdog.List())),
        ["/watchdog/view"]                       = new Route((ctx, username) => new(Tasks.Watchdog.View(ctx))),
        ["/watchdog/create"]                     = new Route((ctx, username) => new(Tasks.Watchdog.Create(ctx, username)), "POST"),
        ["/watchdog/delete"]                     = new Route((ctx, username) => new(Tasks.Watchdog.Delete(ctx, username)), "POST"),

        ["/notifications/list"]                  = new Route((ctx, username) => new(Tasks.Watchdog.ListNotifications())),
        ["/notifications/save"]                  = new Route((ctx, username) => new(Tasks.Watchdog.SaveNotifications(ctx, username)), "POST"),

        ["/lifeline/ping/view"]                  = new Route((ctx, username) => new(Tasks.Lifeline.ViewPing(ctx))),
        ["/lifeline/memory/view"]                = new Route((ctx, username) => new(Tasks.Lifeline.ViewFile(ctx, "memory"))),
        ["/lifeline/cpu/view"]                   = new Route((ctx, username) => new(Tasks.Lifeline.ViewFile(ctx, "cpu"))),
        ["/lifeline/disk/view"]                  = new Route((ctx, username) => new(Tasks.Lifeline.ViewFile(ctx, "disk"))),
        ["/lifeline/diskio/view"]                = new Route((ctx, username) => new(Tasks.Lifeline.ViewFile(ctx, "diskio"))),
        ["/lifeline/printcount/view"]            = new Route((ctx, username) => new(Tasks.Lifeline.ViewFile(ctx, "printcount"))),
        ["/lifeline/switchcount/view"]           = new Route((ctx, username) => new(Tasks.Lifeline.ViewFile(ctx, "switchcount"))),
        ["/lifeline/switchstpchanges/view"]      = new Route((ctx, username) => new(Tasks.Lifeline.ViewFile(ctx, "switchstpchanges"))),
        ["/lifeline/months"]                     = new Route((ctx, username) => new(Tasks.Lifeline.ListMonths(ctx))),
        ["/lifeline/devices"]                    = new Route((ctx, username) => new(Tasks.Lifeline.ListDevices())),

        ["/tools/bulkping"]                      = new Route((ctx, username) => new(Protocols.Icmp.BulkPing(ctx))),
        ["/tools/dnslookup"]                     = new Route((ctx, username) => new(Protocols.Dns.Resolve(ctx))),
        ["/tools/mdnslookup"]                    = new Route((ctx, username) => new(Protocols.Mdns.Resolve(ctx))),
        ["/tools/ntp"]                           = new Route((ctx, username) => new(Protocols.Ntp.Request(ctx))),
        ["/tools/maclookup"]                     = new Route((ctx, username) => new(Tools.MacLookup.Lookup(ctx))),
        ["/tools/nics/list"]                     = new Route((ctx, username) => new(Tools.IpDiscovery.ListNics())),
        ["/serial/ports"]                        = new Route((ctx, username) => new(Protocols.SerialCom.ListPorts())),

        ["/snmp/get"]                            = new Route((ctx, username) => new(Protocols.Snmp.Polling.GetHandler(ctx))),
        ["/snmp/set"]                            = new Route((ctx, username) => new(Protocols.Snmp.Polling.SetHandler(ctx)), "POST"),
        ["/snmp/walk"]                           = new Route((ctx, username) => new(Protocols.Snmp.Polling.WalkHandler(ctx))),
        ["/snmp/switchinterface"]                = new Route((ctx, username) => new(Protocols.Snmp.Polling.GetInterfaces(ctx))),

        ["/snmptraps/list"]                      = new Route((ctx, username) => new(Protocols.Snmp.Traps.ListHandler(ctx))),
        ["/snmptraps/devices"]                   = new Route((ctx, username) => new(Protocols.Snmp.Traps.ListDevices())),
        ["/snmptraps/summary"]                   = new Route((ctx, username) => new(Protocols.LogFiles.SummaryHandler(ctx, Data.DIR_SNMP_TRAPS, 6))),
        ["/snmptraps/listeners/list"]            = new Route((ctx, username) => new(Protocols.Snmp.Traps.List())),
        ["/snmptraps/listeners/save"]            = new Route((ctx, username) => new(Protocols.Snmp.Traps.Save(ctx, username)), "POST"),

        ["/syslog/list"]                         = new Route((ctx, username) => new(Protocols.Syslog.ListHandler(ctx))),
        ["/syslog/devices"]                      = new Route((ctx, username) => new(Protocols.Syslog.ListDevices())),
        ["/syslog/summary"]                      = new Route((ctx, username) => new(Protocols.LogFiles.SummaryHandler(ctx, Data.DIR_SYSLOG, 8))),
        ["/syslog/listeners/list"]               = new Route((ctx, username) => new(Protocols.Syslog.List())),
        ["/syslog/listeners/save"]               = new Route((ctx, username) => new(Protocols.Syslog.Save(ctx, username)), "POST"),

        ["/winevents/list"]                      = new Route((ctx, username) => new(Protocols.WinEvents.ListHandler(ctx))),
        ["/winevents/devices"]                   = new Route((ctx, username) => new(Protocols.WinEvents.ListDevices())),
        ["/winevents/summary"]                   = new Route((ctx, username) => new(Protocols.WinEvents.SummaryHandler(ctx))),
        ["/winevents/fetch"]                     = new Route((ctx, username) => new(Protocols.WinEvents.FetchHandlerAsync(ctx)), "POST"),

        ["/sftp/download"]                       = new Route((ctx, username) => new(Protocols.Sftp.DownloadFileHandler(ctx, username))),
        ["/sftp/upload"]                         = new Route((ctx, username) => new(Protocols.Sftp.UploadFileHandler(ctx, username)), "POST"),

        ["/wmi/query"]                           = new Route((ctx, username) => new(OperatingSystem.IsWindows() ? Protocols.Wmi.Query(ctx) : null)),
        ["/wmi/killprocess"]                     = new Route((ctx, username) => new(OperatingSystem.IsWindows() ? Protocols.Wmi.WmiKillProcess(ctx) : null), "POST"),

        ["/rproxy/list"]                         = new Route((ctx, username) => new(Proxy.ReverseProxy.List())),
        ["/rproxy/create"]                       = new Route((ctx, username) => new(Proxy.ReverseProxy.Create(ctx, username)), "POST"),
        ["/rproxy/delete"]                       = new Route((ctx, username) => new(Proxy.ReverseProxy.Delete(ctx, username)), "POST"),
        ["/rproxy/start"]                        = new Route((ctx, username) => new(Proxy.ReverseProxy.Start(ctx, username)), "POST"),
        ["/rproxy/stop"]                         = new Route((ctx, username) => new(Proxy.ReverseProxy.Stop(ctx, username)), "POST"),

        ["/issues/start"]                        = new Route((ctx, username) => new(Tasks.Issues.Start(username)), "POST"),

        ["/rbac/list"]                           = new Route((ctx, username) => new(Auth.ListUsers())),
        ["/rbac/create"]                         = new Route((ctx, username) => new(Auth.CreateUser(ctx, username)), "POST"),
        ["/rbac/delete"]                         = new Route((ctx, username) => new(Auth.DeleteUser(ctx, username)), "POST"),
        ["/rbac/sessions"]                       = new Route((ctx, username) => new(Auth.ListSessions())),
        ["/rbac/kickuser"]                       = new Route((ctx, username) => new(Auth.KickUser(ctx, username)), "POST"),
        ["/rbac/reregistermfa"]                  = new Route((ctx, username) => new(Auth.ResetMfaSecret(ctx, username)), "POST"),

        ["/scheduler/list"]                      = new Route((ctx, username) => new(Tasks.Scheduler.List())),
        ["/scheduler/save"]                      = new Route((ctx, username) => new(Tasks.Scheduler.Save(ctx, username)), "POST"),
        ["/scheduler/run"]                       = new Route((ctx, username) => new(Tasks.Scheduler.Run(ctx, username)), "POST"),

        ["/config/checkupdate"]                  = new Route((ctx, username) => new(Update.CheckLatestRelease())),

        ["/config/backup/list"]                  = new Route((ctx, username) => new(Backup.List())),
        ["/config/backup/create"]                = new Route((ctx, username) => new(Backup.Create(ctx, username)), "POST"),
        ["/config/backup/delete"]                = new Route((ctx, username) => new(Backup.Delete(ctx, username)), "POST"),
        ["/config/backup/download"]              = new Route((ctx, username) => new(Backup.Download(ctx, username))),

        ["/config/zones/list"]                   = new Route((ctx, username) => new(Tools.Zones.ListZones())),
        ["/config/zones/save"]                   = new Route((ctx, username) => new(Tools.Zones.SaveZones(ctx, username)), "POST"),
        ["/config/dhcprange/list"]               = new Route((ctx, username) => new(Tools.DhcpRange.ListRange())),
        ["/config/dhcprange/save"]               = new Route((ctx, username) => new(Tools.DhcpRange.SaveRange(ctx, username)), "POST"),

        ["/config/smtpprofiles/list"]            = new Route((ctx, username) => new(Tools.SmtpProfiles.List())),
        ["/config/smtpprofiles/save"]            = new Route((ctx, username) => new(Tools.SmtpProfiles.Save(ctx, username)), "POST"),
        ["/config/smtpprofiles/test"]            = new Route((ctx, username) => new(Tools.SmtpProfiles.SendTest(ctx)), "POST"),
        ["/config/smtpprofiles/oauth/start"]     = new Route((ctx, username) => new(Tools.SmtpOAuth.Start(ctx)), "POST"),
        ["/config/smtpprofiles/oauth/poll"]      = new Route((ctx, username) => new(Tools.SmtpOAuth.Poll(ctx)), "POST"),
        ["/config/smtpprofiles/oauth/complete"]  = new Route((ctx, username) => new(Tools.SmtpOAuth.Complete(ctx)), "POST"),

        ["/config/snmpprofiles/list"]            = new Route((ctx, username) => new(Tools.SnmpProfiles.List(ctx))),
        ["/config/snmpprofiles/save"]            = new Route((ctx, username) => new(Tools.SnmpProfiles.Save(ctx, username)), "POST"),

        ["/config/integration/types"]            = new Route((ctx, username) => new(Integration.Integration.GetTypes())),
        ["/config/integration/list"]             = new Route((ctx, username) => new(Integration.Integration.List())),
        ["/config/integration/get"]              = new Route((ctx, username) => new(Integration.Integration.Get(ctx))),
        ["/config/integration/save"]             = new Route((ctx, username) => new(Integration.Integration.Save(ctx, username)), "POST"),
        ["/config/integration/delete"]           = new Route((ctx, username) => new(Integration.Integration.Delete(ctx, username)), "POST"),
        ["/config/integration/test"]             = new Route((ctx, username) => new(Integration.Integration.Test(ctx, username)), "POST"),

        ["/config/ares/types"]                   = new Route((ctx, username) => new(Ares.Core.GetTypes())),
        ["/config/ares/list"]                    = new Route((ctx, username) => new(Ares.Core.List())),
        ["/config/ares/get"]                     = new Route((ctx, username) => new(Ares.Core.Get(ctx))),
        ["/config/ares/save"]                    = new Route((ctx, username) => new(Ares.Core.Save(ctx, username)), "POST"),
        ["/config/ares/delete"]                  = new Route((ctx, username) => new(Ares.Core.Delete(ctx, username)), "POST"),
        ["/config/ares/test"]                    = new Route(async (ctx, username) => await Ares.Core.TestAsync(ctx, username), "POST"),

        ["/ares/history/list"]                   = new Route((ctx, username) => new(Ares.Core.ListHistory(ctx))),
        ["/ares/history/get"]                    = new Route((ctx, username) => new(Ares.Core.GetHistory(ctx))),
        ["/ares/history/branch"]                 = new Route((ctx, username) => new(Ares.Core.BranchHistory(ctx)), "POST"),
        ["/ares/history/delete"]                 = new Route((ctx, username) => new(Ares.Core.DeleteHistory(ctx)), "POST"),
        ["/ares/agents"]                         = new Route((ctx, username) => new(Ares.Core.List(true))),
        ["/ares/models"]                         = new Route(async (ctx, username) => await Ares.Core.GetModelsAsync(ctx, username)),
        ["/ares/chat"]                           = new Route(async (ctx, username) => await Ares.Core.ChatAsync(ctx), "POST", StreamsResponse:true),

        ["/config/cert/list"]                    = new Route((ctx, username) => new(Tools.Cert.List())),
        ["/config/cert/create"]                  = new Route((ctx, username) => new(Tools.Cert.Create(ctx, username)), "POST"),
        ["/config/cert/delete"]                  = new Route((ctx, username) => new(Tools.Cert.Delete(ctx, username)), "POST"),
        ["/config/cert/info"]                    = new Route((ctx, username) => new(Tools.Cert.GetCertInfo(ctx))),
        ["/config/cert/upload"]                  = new Route((ctx, username) => new(Tools.Cert.Upload(ctx, username)), "POST"),
        ["/config/cert/download"]                = new Route((ctx, username) => new(Tools.Cert.Download(ctx, username))),

        ["/config/dataretention/lifeline"]       = new Route((ctx, username) => new(DataRetention.Handler(ctx, username, "lifeline")), "POST"),
        ["/config/dataretention/lastseen"]       = new Route((ctx, username) => new(DataRetention.Handler(ctx, username, "lastseen")), "POST"),
        ["/config/dataretention/watchdog"]       = new Route((ctx, username) => new(DataRetention.Handler(ctx, username, "watchdog")), "POST"),
        ["/config/dataretention/recordings"]     = new Route((ctx, username) => new(DataRetention.Handler(ctx, username, "recordings")), "POST"),
        ["/config/dataretention/ares"]           = new Route((ctx, username) => new(DataRetention.Handler(ctx, username, "ares")), "POST"),
        ["/config/dataretention/logs"]           = new Route((ctx, username) => new(DataRetention.Handler(ctx, username, "logs")), "POST"),
        ["/config/dataretention/syslog"]         = new Route((ctx, username) => new(DataRetention.Handler(ctx, username, "syslog")), "POST"),
        ["/config/dataretention/snmptraps"]      = new Route((ctx, username) => new(DataRetention.Handler(ctx, username, "snmptraps")), "POST"),
        ["/config/dataretention/winevents"]      = new Route((ctx, username) => new(DataRetention.Handler(ctx, username, "winevents")), "POST"),
        ["/config/dataretention/devicetimeline"] = new Route((ctx, username) => new(DataRetention.Handler(ctx, username, "devicetimeline")), "POST"),
        ["/config/dataretention/usertimeline"]   = new Route((ctx, username) => new(DataRetention.Handler(ctx, username, "usertimeline")), "POST"),

        ["/config/dataretention/settings/list"]  = new Route((ctx, username) => new(DataRetention.ListSettings())),
        ["/config/dataretention/settings/save"]  = new Route((ctx, username) => new(DataRetention.SaveSettings(ctx, username)), "POST"),

        ["/config/sessionrecording/get"]         = new Route((ctx, username) => new(Protocols.SessionRecording.GetSettings())),
        ["/config/sessionrecording/save"]        = new Route((ctx, username) => new(Protocols.SessionRecording.SaveSettings(ctx, username)), "POST"),

        ["/config/rustdesk/get"]                 = new Route((ctx, username) => new(Protocols.RustDesk.GetServerSettings())),
        ["/config/rustdesk/save"]                = new Route((ctx, username) => new(Protocols.RustDesk.SaveServerSettings(ctx, username)), "POST"),

        ["/api/list"]                            = new Route((ctx, username) => new(Tools.Api.List())),
        ["/api/save"]                            = new Route((ctx, username) => new(Tools.Api.Save(ctx, username)), "POST"),

        ["/log/list"]                            = new Route((ctx, username) => new(Logger.List(ctx))),

        ["/recordings/list"]                     = new Route((ctx, username) => new(Protocols.SessionRecording.ListHandler(ctx))),
        ["/recordings/meta"]                     = new Route((ctx, username) => new(Protocols.SessionRecording.MetaHandler(ctx)))
    }.ToFrozenDictionary();
}
