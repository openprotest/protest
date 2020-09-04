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
        const title = document.createElement("div");
        title.innerHTML = "Pro-test user guide";
        title.style.textAlign= "center";
        title.style.fontSize = "28px";
        title.style.textDecoration = "underline";
        title.style.fontWeight = "800";
        this.body.appendChild(title);

        this.body.appendChild(document.createElement("br"));

        const introAlign = document.createElement("div");
        introAlign.style.textAlign = "center";
        this.body.appendChild(introAlign);

        introAlign.appendChild(document.createElement("br"));

        const logo = document.createElement("img");
        logo.style.gridArea = "1 / 2 / 6 / 2";
        logo.style.userSelect = "none";
        logo.style.userDrag = "none";
        logo.style.webkitUserDrag = "none";
        logo.width = "96";
        logo.height = "96";
        logo.src = "res/logo.svgz";
        introAlign.appendChild(logo);

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
            "If you wish to interface from a remote host, you can modify the <i>http_ip</i> and <i>http_port</i> parameters in the <i>config.txt</i> file, to the local end-point of your choice."
        );
        this.InsertParagraph(
            "Requests from IPs other than loopback are rejected and require a username and a password. " +
            "The username must be whitelisted in the <i>config.txt</i> file. " +
            "Your domain controller will handle the authentication."
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
            "It's responsible for handling \"commands\" from Pro-test, such as opening RDP, SSH, SMB connections, etc."
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
            "Additional information is provided in real-time, warning you for low disc space, DNS mismatch, locked out users, etc."
        );

        this.body.appendChild(document.createElement("br"));

        this.InsertHeading("Fetch", "res/fetch.svgz");
        this.InsertParagraph(
            ""
        );
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
            h.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
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