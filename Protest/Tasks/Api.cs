using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Protest.Tasks;
internal static class Api {
    private static readonly object mutex;

    static Api() {
        mutex = new object();
    }

    internal static byte[] List() {
        return null;
    }

    internal static byte[] Create(Dictionary<string, string> parameters, string origin) {
        return null;
    }

    internal static byte[] Delete(Dictionary<string, string> parameters, string origin) {
        return null;
    }

}