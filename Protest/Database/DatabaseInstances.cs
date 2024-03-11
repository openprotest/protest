namespace Protest;

internal static class DatabaseInstances {
    internal static Database devices;
    internal static Database users;

    internal static void Initialize() {
        devices = new Database("device", Data.DIR_DEVICES);
        users = new Database("user", Data.DIR_USERS);
    }
}
