class Guide extends Window {
    constructor() {
        super([64,64,64]);

        this.AddCssDependencies("guide.css");

        this.setTitle("User guide");
        this.setIcon("res/userguide.svgz");

        this.content.style.display = "grid";
        this.content.style.gridTemplateColumns = "auto 250px";
        this.content.style.gridTemplateRows = "auto";

        this.body = document.createElement("div");
        this.body.className = "guide-body";
        this.content.appendChild(this.body);

        this.table = document.createElement("div");
        this.table.className = "guide-content-table";
        this.content.appendChild(this.table);

        this.Init();
    }

    Init() {
        const introAlign = document.createElement("div");
        introAlign.style.textAlign = "center";
        this.body.appendChild(introAlign);

        const logo = document.createElement("img");
        logo.style.gridArea = "1 / 2 / 6 / 2";
        logo.style.userSelect = "none";
        logo.style.userDrag = "none";
        logo.style.webkitUserDrag = "none";
        logo.width = "128";
        logo.height = "128";
        logo.src = "res/logo.svgz";
        introAlign.appendChild(logo);

        introAlign.appendChild(document.createElement("br"));

        const title = document.createElement("div");
        title.innerHTML = "Pro-test user guide";
        title.style.textAlign= "center";
        title.style.fontSize = "28px";
        title.style.textDecoration = "underline";
        title.style.fontWeight = "800";
        introAlign.appendChild(title);


        introAlign.appendChild(document.createElement("br"));

        const opensource = document.createElement("div");
        opensource.style.display = "inline-block";
        opensource.style.paddingTop = "32px";
        opensource.style.fontWeight = "500";
        opensource.style.textAlign = "left";
        opensource.style.maxWidth = "640px";
        opensource.style.userSelect = "text";
        opensource.innerHTML = "Pro-test is a free and open-source tool developed and maintained by Andreas Venizelou.<br>All of the source code to this product is available to you under the GNU General Public License. That means you may use, copy, distribute, and modify the source code to meet your needs.";
        introAlign.appendChild(opensource);

        this.body.appendChild(document.createElement("br"));
        this.body.appendChild(document.createElement("br"));

        this.InsertHeading("Setup", "res/tool01.svgz");
        this.InsertParagraph(
            "If you are reading this, that means you have already configured Pro-test. " +
            "In that case, the <i>config.txt</i> file is automatically created with the default settings."
        );
        this.InsertParagraph(
            "Pro-test, by default, listens only on localhost on port 80 for security reasons. " +
            "If you wish to interface from a remote host, you can modify the <i>http_ip</i> and <i>http_port</i> parameters in the <i>config.txt</i> file to the local end-point of your choice."
        );
        this.InsertParagraph(
            "Requests from IPs other than loopback are rejected and require a username and a password to proceed. " +
            "The username must be whitelisted in the <i>config.txt</i> file, and then your domain controller will handle the authentication."
        );
        this.InsertParagraph(
            "Also, in the <i>config.txt</i>, you can set your database key and your preshared key."
        );
        this.InsertParagraph(
            "The database key is used to encrypt and decrypt your database content. " +
            "If you copied-and-pasted from another database, you would need to replace the database key with the key from your copping database. " +
            "The preshared key is used to establish a secure connection between Pro-test and the Remote agent."
        );

        this.body.appendChild(document.createElement("br"));
        this.InsertHeading("Remote agent", "res/remote.svgz");
        this.InsertParagraph(
            "The Remote Agent is an executable you can run on your remote host. " +
            "It's responsible for handling \"commands\" from Pro-test, such as connecting to remote hosts over RDP, SSH, SMB, uVNC, PSExec, etc."
        );

        this.body.appendChild(document.createElement("br"));

        this.InsertHeading("Database", "res/database.svgz");
        this.InsertParagraph(
            "The database is separated into two categories: Equipment and Users."
        );
        this.InsertParagraph(
            "For increased productivity, you can \"fetch\" equipment and users: " +
            "Pro-test can gather information from your domain controller, from remote hosts over SSH or WMI and port-scanning for know protocols. " +
            "It can analyze the target host and detect what kind of machine it is. " +
            "Of course, you can modify any field the way you want to."
        );
        this.InsertParagraph(
            "Additional information is provided in real-time, letting you know about the last seen date, logged in user, bad password attempts, etc. " +
            "Also, Pro-test will warn you for low disk space, DNS mismatches, locked-out users, and more."
        );

        this.body.appendChild(document.createElement("br"));
        this.InsertHeading("Fetch", "res/fetch.svgz");
        this.InsertParagraph(
            "You can schedule \"Fetch\" to scan your network and populate the database and update existing entries. " +
            "If hosts are unreachable, you can set Pro-test to retry again at another time. <br>" +
            "You can also import data from another Pro-test."
        );

        this.body.appendChild(document.createElement("br"));
        this.InsertHeading("Documentation", "res/documentation.svgz");
        this.InsertParagraph(
            "Keeping a record of your daily jobs enables you to track your progress, but most importantly, you can use it in the future if you face the same issue, avoiding running into the same troubleshooting twice."
        );
        this.InsertParagraph(
            "Pro-test provides a documentation utility where you can add solutions, how-tos, and built your own knowledge-base. " +
            "You can add links to related equipment, paste screen-shots, and format your text to add readability."
        );

        this.body.appendChild(document.createElement("br"));
        this.InsertHeading("Debit notes", "res/charges.svgz");
        this.InsertParagraph(
            "If your business/company requires to give to other teams or departments devices, such as cellphones, laptops, or any other gear, debit notes allows you to manage all that and keep them under control."
        );
        this.InsertParagraph(
            "Fill your debit forms fast and easy by browsing your database for users and devices. " +
            "Finally, you can search all debit notes and find out who has what, quick and easy."
        );

        this.body.appendChild(document.createElement("br"));
        this.InsertHeading("Password strength", "res/strength.svgz");
        this.InsertParagraph(
            "This utility scans your database for passwords and scores them based on their strength, letting you know which users are variable to passwords attacks."
        );
        this.InsertParagraph(
            "The strength algorithm takes into consideration words related to the account, and the password strength is affected by those words. " +
            "If your email is <i>info@domain.com</i> and your password is <i>info123456</i>, the score will be calculated as if the password is <i>123456</i>."
        );

        this.body.appendChild(document.createElement("br"));
        this.InsertHeading("Gandalf", "res/gandalf.svgz");
        this.InsertParagraph(
            "Gandalf is a security tool designed to help you identify users who use weak passwords. " +
            "Users bellow the strength threshold will get an email notification asking them to change to a more secure password."
        );

        this.body.appendChild(document.createElement("br"));
        this.InsertHeading("Ping", "res/ping.svgz");
        this.InsertParagraph(
            "Ping is a network utility used to test the reachability of a host using ICMP echo request. " +
            "Pro-test also provides an alternative ping solution that uses ARP request (ARP operates on a lower level but is a non-routable protocol)."
        );

        this.body.appendChild(document.createElement("br"));
        this.InsertHeading("DNS lookup", "res/dns.svgz");
        this.InsertParagraph(
            "The DNS lookup utility resolves a domain or a hostname to all its IP addresses."
        );

        this.body.appendChild(document.createElement("br"));
        this.InsertHeading("DHCP discover", "res/dhcp.svgz");
        this.InsertParagraph(
            "This utility broadcasts a DHCP-discover message to the local network and list all offers from DHCP servers on the same network."
        );

        this.body.appendChild(document.createElement("br"));
        this.InsertHeading("NTP client", "res/clock.svgz");
        this.InsertParagraph(
            "NTP client can send a time request to the server of your choice and displays the response."
        );

        this.body.appendChild(document.createElement("br"));
        this.InsertHeading("Trace route", "res/traceroute.svgz");
        this.InsertParagraph(
            "Trace route is a network utility used for calculating the route to the specified address."
        );

        this.body.appendChild(document.createElement("br"));
        this.InsertHeading("Port scan", "res/portscan.svgz");
        this.InsertParagraph(
            "Port scan utility scans the specified host for ported TCP ports, listing them with their default protocols. You can customize your scans by limiting your ports to a specific range to optimize your workflow."
        );

        this.body.appendChild(document.createElement("br"));
        this.InsertHeading("Locate IP", "res/locate.svgz");
        this.InsertParagraph(
            "Find the physical location of an IP address or domain. Also, you're getting informed if that host is proxied or not."
        );

        this.body.appendChild(document.createElement("br"));
        this.InsertHeading("MAC lookup", "res/maclookup.svgz");
        this.InsertParagraph(
            "With this tool, you can do a MAC address lookup and find the manufacturer that registered that MAC address."
        );

        this.body.appendChild(document.createElement("br"));
        this.InsertHeading("Website check", "res/websitecheck.svgz");
        this.InsertParagraph(
            "This utility checks if the given website is available and provides additional information to help identify any issues."
        );

        this.body.appendChild(document.createElement("br"));
        this.InsertHeading("Scripts", "res/scripts.svgz");
        this.InsertParagraph(
            "Create your queries and get results in real-time utilizing and combining all of Pro-tests utilities. You write your scripts using a pipe-line based model, by linking entities with each other."
        );

        this.body.appendChild(document.createElement("br"));
        this.InsertHeading("WMI console", "res/wmi.svgz");
        this.InsertParagraph(
            "WMI console is an interface for management that uses Windows Management Instrumentation (WMI). It uses Lite SQL to make queries and get information from the local or a remote host."
        );
        this.InsertParagraph(
            "Pro-test provides a dialog with all WMI classes to help syntax your queries."
        );

        this.body.appendChild(document.createElement("br"));
        this.InsertHeading("Watchdog", "res/watchdog.svgz");
        this.InsertParagraph(
            "Use watchdog to monitor the availability of your network hosts. You can check when a host gets disconnected or a protocol stops responding on a specified port."
        );
        this.InsertParagraph(
            "Enable email notifications to get notified when a host or service unexpected goes offline."
        );

        this.body.appendChild(document.createElement("br"));
        this.body.appendChild(document.createElement("br"));

        const creditsAlign = document.createElement("div");
        creditsAlign.style.textAlign = "center";
        this.body.appendChild(creditsAlign);

        const donate = document.createElement("a");
        donate.style.display = "inline-block";
        donate.style.border = "#202020 1px solid";
        donate.style.borderRadius = "4px";
        donate.style.padding = "2px 4px";
        donate.style.margin = "1px";
        donate.target = "_blank";
        donate.href = "https://paypal.me/veniware/10";
        donate.innerHTML = "Make a donation";
        creditsAlign.appendChild(donate);

        const _or = document.createElement("div");
        _or.style.display = "inline-block";
        _or.style.padding = "1px 4px";
        _or.innerHTML = "or";
        creditsAlign.appendChild(_or);

        const involve = document.createElement("a");
        involve.style.display = "inline-block";
        involve.style.border = "#202020 1px solid";
        involve.style.borderRadius = "4px";
        involve.style.padding = "2px 4px";
        involve.style.margin = "1px";
        involve.target = "_blank";
        involve.href = "https://github.com/veniware/OpenProtest";
        involve.innerHTML = "get involved";
        creditsAlign.appendChild(involve);

        creditsAlign.appendChild(document.createElement("br"));
        creditsAlign.appendChild(document.createElement("br"));
        creditsAlign.appendChild(document.createElement("br"));

        const icons = ["res/logo.svgz", "res/copyleft.svgz", "res/opensource.svgz", "res/gpl.svgz", "res/github.svgz"];
        for (let i = 0; i < icons.length; i++) {
            const newIcon = document.createElement("div");
            newIcon.style.display = "inline-block";
            newIcon.style.width = "52px";
            newIcon.style.height = "52px";
            newIcon.style.margin = "16px";
            newIcon.style.background = `url(${icons[i]})`;
            newIcon.style.backgroundSize = "contain";
            creditsAlign.appendChild(newIcon);
        }      
    }

    InsertHeading(text, icon) {
        const h = document.createElement("h1");
        this.body.appendChild(h);

        const img = document.createElement("img");
        img.width = "24";
        img.height = "24";
        img.src = icon;
        h.appendChild(img);
        h.innerHTML += `&nbsp;${text}`;

        const entry = document.createElement("div");
        entry.innerHTML = text;
        entry.style.backgroundImage = `url(${icon})`;
        this.table.appendChild(entry);

        entry.onclick = () => {
            h.scrollIntoView({ behavior: "smooth", block: "center" });
        };

        return h;
    }

    InsertParagraph(text) {
        const p = document.createElement("p");
        p.innerHTML = text;
        this.body.appendChild(p);
        return p;
    }

}