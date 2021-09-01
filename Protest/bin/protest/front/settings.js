(function initSettings() {
    //automatically disable animations if prefers-reduced-motion
    if (window.matchMedia('(prefers-reduced-motion)').matches && localStorage.getItem("disable_anime") === null)
        localStorage.setItem("disable_anime", "true");

    $w.always_maxxed         = localStorage.getItem("w_always_maxed") === "true";
    container.className      = localStorage.getItem("w_disable_dropshadow") === "true" ? "disable-window-dropshadows" : "";
    document.body.className += localStorage.getItem("disable_anime") === "true" ? " disable-animation" : "";

    if (localStorage.getItem("accent_color"))
        SetAccentColor(localStorage.getItem("accent_color").split(",").map(o => parseInt(o)));
    else
        SetAccentColor([255, 102, 0]);
       
    if (localStorage.getItem("background"))
        main.style.background = localStorage.getItem("background");

    if (localStorage.getItem("font") && localStorage.getItem("font").length > 0)
        document.documentElement.style.setProperty("--global-font-family", localStorage.getItem("font"));
})();

class Settings extends Tabs {
    constructor(args) {
        super();

        this.args = args ? args : "";

        this.setTitle("Settings");
        this.setIcon("res/tool02.svgz");

        this.tabsContainer.style.width = "150px";
        this.subContent.style.left = "175px";
        this.subContent.style.padding = "24px";
        this.subContent.style.overflowY = "auto";

        this.tabGui     = this.AddTab("Appearance", "res/tv.svgz");
        this.tabSession = this.AddTab("Session", "res/hourglass.svgz");
        this.tabLegal   = this.AddTab("License", "res/gpl.svgz");
        this.tabAbout   = this.AddTab("About", "res/logo.svgz");

        this.tabGui.onclick = () => this.ShowGui();
        this.tabSession.onclick = () => this.ShowSession();
        this.tabLegal.onclick = () => this.ShowLegal();
        this.tabAbout.onclick = () => this.ShowAbout();

        switch (this.args) {
            case "icons":
                this.tabIcons.className = "v-tab-selected";
                this.ShowIcons();
                break;

            case "session":
                this.tabSession.className = "v-tab-selected";
                this.ShowSession();
                break;

            case "legal":
                this.tabLegal.className = "v-tab-selected";
                this.ShowLegal();
                break;

            case "about":
                this.tabAbout.className = "v-tab-selected";
                this.ShowAbout();
                break;

            default:
                this.tabGui.className = "v-tab-selected";
                this.ShowGui();
        }
    }

    ShowGui() {
        this.args = "appearance";
        this.subContent.innerHTML = "";

        this.chkPunchMenu = document.createElement("input");
        this.chkPunchMenu.type = "checkbox";
        this.subContent.appendChild(this.chkPunchMenu);
        this.AddCheckBoxLabel(this.subContent, this.chkPunchMenu, "Punch menu icon").style.fontWeight = "600";
        this.subContent.appendChild(document.createElement("br"));
        this.subContent.appendChild(document.createElement("br"));

        this.chkWinMaxxed = document.createElement("input");
        this.chkWinMaxxed.type = "checkbox";
        this.subContent.appendChild(this.chkWinMaxxed);
        this.AddCheckBoxLabel(this.subContent, this.chkWinMaxxed, "Always maximize windows").style.fontWeight = "600";
        this.subContent.appendChild(document.createElement("br"));
        this.subContent.appendChild(document.createElement("br"));

        this.chkDisableAnime = document.createElement("input");
        this.chkDisableAnime.type = "checkbox";
        this.subContent.appendChild(this.chkDisableAnime);
        this.AddCheckBoxLabel(this.subContent, this.chkDisableAnime, "Disable animations").style.fontWeight = "600";
        this.subContent.appendChild(document.createElement("br"));
        this.subContent.appendChild(document.createElement("br"));

        this.chkWindowShadows = document.createElement("input");
        this.chkWindowShadows.type = "checkbox";
        this.subContent.appendChild(this.chkWindowShadows);
        this.AddCheckBoxLabel(this.subContent, this.chkWindowShadows, "Disable window drop-shadows").style.fontWeight = "600";
        this.subContent.appendChild(document.createElement("br"));

        this.subContent.appendChild(document.createElement("br"));
        this.subContent.appendChild(document.createElement("hr"));

        const divColor = document.createElement("div");
        divColor.innerHTML = "Accent color: ";
        divColor.style.fontWeight = "600";
        divColor.style.paddingBottom = "8px";
        this.subContent.appendChild(divColor);

        this.accentIndicators = [];
        let selected_accent = [255, 102, 0];
        if (localStorage.getItem("accent_color"))
            selected_accent = localStorage.getItem("accent_color").split(",").map(o => parseInt(o));

        const accentColors = [[255,51,34], [255,102,0], [255,186,0], [96,192,32], [36,176,244]];

        for (let i = 0; i < accentColors.length; i++) {
            let rgbString = `rgb(${accentColors[i][0]},${accentColors[i][1]},${accentColors[i][2]})`;
            let hsl = RgbToHsl(accentColors[i]);

            let step1 = `hsl(${hsl[0]-4},${hsl[1]}%,${hsl[2]*.78}%)`;
            let step2 = `hsl(${hsl[0]+7},${hsl[1]}%,${hsl[2]*.9}%)`; //--select-color
            let step3 = `hsl(${hsl[0]-4},${hsl[1]}%,${hsl[2]*.8}%)`;
            let gradient = `linear-gradient(to bottom, ${step1}0%, ${step2}92%, ${step3}100%)`;

            const themeBox = document.createElement("div");
            themeBox.style.display = "inline-block";
            themeBox.style.margin = "2px 4px";
            this.subContent.appendChild(themeBox);

            const gradientBox = document.createElement("div");
            gradientBox.style.width = "48px";
            gradientBox.style.height = "48px";
            gradientBox.style.borderRadius = "4px";
            gradientBox.style.background = gradient;
            gradientBox.style.border = step1 + " 1px solid";
            themeBox.appendChild(gradientBox);

            let isSelected = selected_accent[0] == accentColors[i][0] && selected_accent[1] == accentColors[i][1] && selected_accent[2] == accentColors[i][2];

            const indicator = document.createElement("div");
            indicator.style.width = isSelected ? "48px" : "8px";
            indicator.style.height = "8px";
            indicator.style.borderRadius = "8px";
            indicator.style.marginTop = "4px";
            indicator.style.marginLeft = isSelected ? "0" : "20px";
            indicator.style.backgroundColor = rgbString;
            indicator.style.border = step1 + " 1px solid";
            indicator.style.transition = ".4s";
            themeBox.appendChild(indicator);

            this.accentIndicators.push(indicator);

            themeBox.onclick = () => {
                localStorage.setItem("accent_color", `${accentColors[i][0]},${accentColors[i][1]},${accentColors[i][2]}`);
                SetAccentColor(accentColors[i]);

                for (let j = 0; j < $w.array.length; j++) //update other setting windows
                    if ($w.array[j] instanceof Settings && $w.array[j].args === "appearance") {
                        for (let k = 0; k < this.accentIndicators.length; k++) {
                            $w.array[j].accentIndicators[k].style.width = "8px";
                            $w.array[j].accentIndicators[k].style.marginLeft = "20px";
                        }
                        $w.array[j].accentIndicators[i].style.width = "48px";
                        $w.array[j].accentIndicators[i].style.marginLeft = "0px";
                    }
            };
        }

        this.subContent.appendChild(document.createElement("hr"));

        const divBackground = document.createElement("div");
        divBackground.innerHTML = "Background: ";
        divBackground.style.fontWeight = "600";
        divBackground.style.paddingBottom = "8px";
        this.subContent.appendChild(divBackground);

        this.bgIndicators = [];
        let selected_bg = "";
        if (localStorage.getItem("background"))
            selected_bg = localStorage.getItem("background");

        const background_list = [
            ["System",   ""],
            ["Light",    "var(--bg-light)"],
            ["Sky blue", "var(--bg)"],
            ["Dark",     "var(--bg-dark)"],
            ["Blue",     "var(--bg-blue)"],
            ["Green",    "var(--bg-green)"],
            ["Carbon",   "var(--bg-carbon)"],
            ["Metal",    "var(--bg-metal)"]
        ];

        for (let i = 0; i < background_list.length; i++) {
            const bgBox = document.createElement("div");
            bgBox.style.display = "inline-block";
            bgBox.style.margin = "2px 4px";
            this.subContent.appendChild(bgBox);

            const previewBox = document.createElement("div");
            previewBox.innerHTML = background_list[i][0];
            previewBox.style.textAlign = "center";
            previewBox.style.lineHeight = "72px";
            previewBox.style.fontWeight = "700";
            previewBox.style.textShadow = "#fff 0px 0px 2px";
            previewBox.style.width = "96px";
            previewBox.style.height = "80px";
            previewBox.style.borderRadius = "4px";
            previewBox.style.background = background_list[i][1];
            previewBox.style.border = "rgb(96,96,96) 2px solid";
            bgBox.appendChild(previewBox);

            let isSelected = selected_bg == background_list[i][1];

            const indicator = document.createElement("div");
            indicator.style.width = isSelected ? "96px" : "8px";
            indicator.style.height = "8px";
            indicator.style.borderRadius = "8px";
            indicator.style.marginTop = "4px";
            indicator.style.marginLeft = isSelected ? "0" : "44px";
            indicator.style.backgroundColor = "rgb(64,64,64)";
            indicator.style.border = "transparent 1px solid";
            indicator.style.transition = ".4s";
            bgBox.appendChild(indicator);

            this.bgIndicators.push(indicator);

            bgBox.onclick = () => {
                localStorage.setItem("background", background_list[i][1]);
                main.style.background = background_list[i][1];

                for (let j = 0; j < $w.array.length; j++) //update other setting windows
                    if ($w.array[j] instanceof Settings && $w.array[j].args === "appearance") {
                        for (let k = 0; k < this.bgIndicators.length; k++) {
                            $w.array[j].bgIndicators[k].style.width = "8px";
                            $w.array[j].bgIndicators[k].style.marginLeft = "44px";
                        }
                        $w.array[j].bgIndicators[i].style.width = "96px";
                        $w.array[j].bgIndicators[i].style.marginLeft = "0px";
                    }
            };
        }

        this.chkPunchMenu.checked         = localStorage.getItem("punch_menu") === "true";
        this.chkWinMaxxed.checked         = localStorage.getItem("w_always_maxed") === "true";
        this.chkDisableAnime.checked      = localStorage.getItem("disable_anime") === "true";
        this.chkWindowShadows.checked     = localStorage.getItem("w_disable_dropshadow") === "true";

        const Apply = ()=> {
            $w.always_maxxed = this.chkWinMaxxed.checked;
            document.body.className += this.chkDisableAnime.checked ? " disable-animation" : "";
            container.className = this.chkWindowShadows.checked ? "disable-window-dropshadows" : "";

            localStorage.setItem("punch_menu", this.chkPunchMenu.checked);
            localStorage.setItem("w_always_maxed", this.chkWinMaxxed.checked);
            localStorage.setItem("disable_anime", this.chkDisableAnime.checked);
            localStorage.setItem("w_disable_dropshadow", this.chkWindowShadows.checked);

            for (let i = 0; i < $w.array.length; i++) //update other setting windows
                if ($w.array[i] instanceof Settings && $w.array[i].args === "appearance") {
                    $w.array[i].chkPunchMenu.checked         = this.chkPunchMenu.checked;
                    $w.array[i].chkWinMaxxed.checked         = this.chkWinMaxxed.checked;
                    $w.array[i].chkDisableAnime.checked      = this.chkDisableAnime.checked;
                    $w.array[i].chkWindowShadows.checked     = this.chkWindowShadows.checked;
                }
        };

        this.chkPunchMenu.onchange         = Apply;
        this.chkWinMaxxed.onchange         = Apply;
        this.chkDisableAnime.onchange      = Apply;
        this.chkWindowShadows.onchange     = Apply;

        Apply();
    }

    ShowSession() {
        this.args = "session";
        this.subContent.innerHTML = "";

        this.chkRestoreSession = document.createElement("input");
        this.chkRestoreSession.type = "checkbox";
        this.subContent.appendChild(this.chkRestoreSession);
        this.AddCheckBoxLabel(this.subContent, this.chkRestoreSession, "Re-open previous windows on page load").style.fontWeight = "600";

        this.subContent.appendChild(document.createElement("br"));
        this.subContent.appendChild(document.createElement("br"));
        this.subContent.appendChild(document.createElement("hr"));
        this.subContent.appendChild(document.createElement("br"));

        this.chkAliveOnClose = document.createElement("input");
        this.chkAliveOnClose.type = "checkbox";
        this.subContent.appendChild(this.chkAliveOnClose);
        this.AddCheckBoxLabel(this.subContent, this.chkAliveOnClose, "Keep session alive when browser is closed").style.fontWeight = "600";

        this.subContent.appendChild(document.createElement("br"));
        this.subContent.appendChild(document.createElement("br"));

        const divSessionTimeout = document.createElement("div");
        divSessionTimeout.innerHTML = "Logout if inactive for: ";
        divSessionTimeout.style.display = "inline-block";
        divSessionTimeout.style.minWidth = "200px";
        divSessionTimeout.style.fontWeight = "600";
        this.subContent.appendChild(divSessionTimeout);

        this.sessionTimeout = document.createElement("input");
        this.sessionTimeout.type = "range";
        this.sessionTimeout.min = "1";
        this.sessionTimeout.max = "8";
        this.sessionTimeout.style.width = "200px";
        this.subContent.appendChild(this.sessionTimeout);

        this.divSessionTimeoutValue = document.createElement("div");
        this.divSessionTimeoutValue.innerHTML = "15 min.";
        this.divSessionTimeoutValue.style.paddingLeft = "8px";
        this.divSessionTimeoutValue.style.display = "inline-block";
        this.subContent.appendChild(this.divSessionTimeoutValue);


        this.subContent.appendChild(document.createElement("br"));
        this.subContent.appendChild(document.createElement("br"));

        const divCookieLife = document.createElement("div");
        divCookieLife.innerHTML = "Cookie lifetime: ";
        divCookieLife.style.display = "inline-block";
        divCookieLife.style.minWidth = "200px";
        divCookieLife.style.fontWeight = "600";
        this.subContent.appendChild(divCookieLife);

        this.cookieLife = document.createElement("input");
        this.cookieLife.type = "range";
        this.cookieLife.min = "1";
        this.cookieLife.max = "12";
        this.cookieLife.style.width = "200px";
        this.subContent.appendChild(this.cookieLife);

        this.divCookieLifeValue = document.createElement("div");
        this.divCookieLifeValue.innerHTML = "15 min.";
        this.divCookieLifeValue.style.paddingLeft = "8px";
        this.divCookieLifeValue.style.display = "inline-block";
        this.subContent.appendChild(this.divCookieLifeValue);


        this.subContent.appendChild(document.createElement("br"));
        this.subContent.appendChild(document.createElement("br"));
        this.subContent.appendChild(document.createElement("hr"));
        this.subContent.appendChild(document.createElement("br"));

        const btnClearLocalCache = document.createElement("input");
        btnClearLocalCache.type = "button";
        btnClearLocalCache.value = "Clear local storage";
        btnClearLocalCache.style.height = "36px";
        btnClearLocalCache.style.padding = "8px";
        this.subContent.appendChild(btnClearLocalCache);

        this.chkRestoreSession.checked = localStorage.getItem("restore_session") === "true";
        this.chkAliveOnClose.checked = localStorage.getItem("alive_after_close") === "true";
        this.sessionTimeout.value = localStorage.getItem("session_timeout") == null ? 1 : parseInt(localStorage.getItem("session_timeout"));
        this.cookieLife.value = localStorage.getItem("cookie_lifetime") == null ? 7 : parseInt(localStorage.getItem("cookie_lifetime"));


        btnClearLocalCache.onclick = () => { this.ClearCache() };

        const timeMapping = { 1:15, 2:30, 3:60, 4:2*60, 5:4*60, 6:8*60, 7:24*60, 8:Infinity };
        const cookieMapping = { 1:1, 2:2, 3:3, 4:4, 5:5, 6:6, 7:7, 8:14, 9:21, 10:28, 11:60, 12:90 };
        const Apply = () => {
            localStorage.setItem("restore_session", this.chkRestoreSession.checked);
            localStorage.setItem("alive_after_close", this.chkAliveOnClose.checked);
            localStorage.setItem("session_timeout", this.sessionTimeout.value);
            localStorage.setItem("cookie_lifetime", this.cookieLife.value);           
            
            for (let i = 0; i < $w.array.length; i++) //update other setting windows
                if ($w.array[i] instanceof Settings && $w.array[i].args === "session") {
                    $w.array[i].chkRestoreSession.checked = this.chkRestoreSession.checked;
                    $w.array[i].chkAliveOnClose.checked   = this.chkAliveOnClose.checked;
                    $w.array[i].sessionTimeout.value      = this.sessionTimeout.value;
                    $w.array[i].cookieLife.value = this.cookieLife.value;

                    if (timeMapping[this.sessionTimeout.value] == Infinity) {
                        $w.array[i].divSessionTimeoutValue.innerHTML = timeMapping[this.sessionTimeout.value];
                    } else {
                        let value = timeMapping[this.sessionTimeout.value];
                        $w.array[i].divSessionTimeoutValue.innerHTML = value > 60 ? value / 60 + " hours" : value + " minutes";
                    }

                    if (cookieMapping[this.cookieLife.value] < 8)
                        $w.array[i].divCookieLifeValue.innerHTML = cookieMapping[this.cookieLife.value] == 1 ? "1 day" : cookieMapping[this.cookieLife.value] + " days";
                    else if (cookieMapping[this.cookieLife.value] < 29)
                        $w.array[i].divCookieLifeValue.innerHTML = cookieMapping[this.cookieLife.value] == 7 ? "1 week" : cookieMapping[this.cookieLife.value] / 7 + " weeks";
                    else
                        $w.array[i].divCookieLifeValue.innerHTML = cookieMapping[this.cookieLife.value] == 30 ? "1 month" : cookieMapping[this.cookieLife.value] / 30 + " months";

                }
        };

        this.chkRestoreSession.onchange = Apply;
        this.chkAliveOnClose.onchange = Apply;
        this.sessionTimeout.oninput = Apply;

        this.cookieLife.oninput = () => {
            KeepAlive_SendAction(`updatesessiontimeout${String.fromCharCode(127)}${cookieMapping[this.cookieLife.value]}`);
            Apply();
        };

        Apply();
    }

    ShowLegal() {
        this.args = "legal";
        this.subContent.innerHTML = "";

        const box = document.createElement("div");
        box.style.fontFamily = "monospace";
        box.style.userSelect = "text";
        this.subContent.appendChild(box);

        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.status == 403) location.reload(); //authorization

            if (xhr.readyState == 4 && xhr.status == 200) {
                let license = xhr.responseText;
                license = license.replaceAll(" ", "&nbsp;");
                license = license.replaceAll("<", "&lt;");
                license = license.replaceAll(">", "&gt;");
                license = license.replaceAll("\n", "<br>");
                box.innerHTML = license;
            } 
        };
        xhr.open("GET", "license.txt", true);
        xhr.send();
    }

    ShowAbout() {
        this.args = "about";
        this.subContent.innerHTML = "";

        const aboutBox = document.createElement("div");
        aboutBox.style.padding = "16px";
        aboutBox.style.display = "grid";
        aboutBox.style.gridTemplateColumns = "auto 150px 200px auto";
        aboutBox.style.gridTemplateRows = "repeat(6, 24px)";
        aboutBox.style.alignItems = "end";
        aboutBox.style.userSelect = "text";
        this.subContent.appendChild(aboutBox);

        const logo = document.createElement("img");
        logo.style.gridArea = "1 / 2 / 6 / 2";
        logo.style.userSelect = "none";
        logo.style.userDrag = "none";
        logo.style.webkitUserDrag = "none";
        logo.width = "128";
        logo.height = "128";
        logo.src = "res/logo.svgz";
        aboutBox.appendChild(logo);

        const name = document.createElement("div");
        name.style.gridArea = "2 / 3";
        name.style.fontWeight = "600";
        name.innerHTML = "Pro-test";
        aboutBox.appendChild(name);

        const version = document.createElement("div");
        version.style.gridArea = "3 / 3";
        version.style.fontWeight = "500";
        version.innerHTML = "Version 4";
        aboutBox.appendChild(version);

        const description = document.createElement("div");
        description.style.fontWeight = "500";
        description.style.textAlign = "center";
        description.style.userSelect = "text";
        description.innerHTML = "A management base for System Admins and IT professionals.";
        this.subContent.appendChild(description);

        const center = document.createElement("div");
        center.style.textAlign = "center";
        this.subContent.appendChild(center);

        const opensource = document.createElement("div");
        opensource.style.display = "inline-block";
        opensource.style.paddingTop = "32px";
        opensource.style.fontWeight = "500";
        opensource.style.textAlign = "left";
        opensource.style.maxWidth = "640px";
        opensource.style.userSelect = "text";
        opensource.innerHTML = "Pro-test is a free and open-source tool developed and maintained by Andreas Venizelou.<br>All of the source code to this product is available to you under the GNU General Public License. That means you may use, copy, distribute, and modify the source code to meet your needs.";
        center.appendChild(opensource);

        center.appendChild(document.createElement("br"));
        center.appendChild(document.createElement("br"));

        const credits = document.createElement("div");
        credits.style.display = "inline-block";
        credits.style.paddingTop = "32px";
        credits.style.maxWidth = "640px";
        credits.style.textAlign = "left";
        credits.style.userSelect = "text";
        credits.innerHTML = "Some of Pro-tests tools use external code and make use of the following libraries:<br>";
        credits.innerHTML += "<b>-</b> MAC addresses lookup table          <a target='_blank' href='https://regauth.standards.ieee.org/standards-ra-web/pub/view.html'>by ieee</a><br>";
        credits.innerHTML += "<b>-</b> IP2Location LITE                    <a target='_blank' href='https://ip2location.com'>by ip2location.com</a><br>";
        credits.innerHTML += "<b>-</b> IP2Proxy LITE                       <a target='_blank' href='https://ip2location.com'>by ip2location.com</a><br>";
        credits.innerHTML += "<b>-</b> Renci.SshNet.SshClient              <a target='_blank' href='https://nuget.org/packages/SSH.NET'>by Renci</a><br>";
        credits.innerHTML += "<b>-</b> Microsoft.Management.Infrastructure <a target='_blank' href='https://nuget.org/packages/Microsoft.Management.Infrastructure/'>by Microsoft</a><br>";
        credits.innerHTML += "<b>-</b> System.Management.Automation        <a target='_blank' href='https://docs.microsoft.com/en-us/dotnet/api/system.management.automation'>by Microsoft</a><br>";
        credits.innerHTML += "<b>-</b> Open Sans typeface                  <a>by Steve Matteson</a><br>";
        center.appendChild(credits);

        center.appendChild(document.createElement("br"));
        center.appendChild(document.createElement("br"));
        center.appendChild(document.createElement("br"));

        const donate = document.createElement("a");
        donate.style.display = "inline-block";
        donate.style.border = "#202020 1px solid";
        donate.style.borderRadius = "4px";
        donate.style.padding = "2px 4px";
        donate.style.margin = "1px";
        donate.target = "_blank";
        donate.href = "https://paypal.me/veniware/10";
        donate.innerHTML = "Make a donation";
        center.appendChild(donate);

        const _or = document.createElement("div");
        _or.style.display = "inline-block";
        _or.style.padding = "1px 4px";
        _or.innerHTML = "or";
        center.appendChild(_or);

        const involve = document.createElement("a");
        involve.style.display = "inline-block";
        involve.style.border = "#202020 1px solid";
        involve.style.borderRadius = "4px";
        involve.style.padding = "2px 4px";
        involve.style.margin = "1px";
        involve.target = "_blank";
        involve.href = "https://github.com/veniware/OpenProtest";
        involve.innerHTML = "get involved";
        center.appendChild(involve);

        center.appendChild(document.createElement("br"));
        center.appendChild(document.createElement("br"));
        center.appendChild(document.createElement("br"));

        const icons = ["res/logo.svgz", "res/copyleft.svgz", "res/opensource.svgz","res/gpl.svgz", "res/github.svgz"];
        for (let i = 0; i < icons.length; i++) {
            const newIcon = document.createElement("div");
            newIcon.style.display = "inline-block";
            newIcon.style.width = "52px";
            newIcon.style.height = "52px";
            newIcon.style.margin = "16px";
            newIcon.style.background = `url(${icons[i]})`;
            newIcon.style.backgroundSize = "contain";
            center.appendChild(newIcon);
        }        

        logo.onclick = () => {
            logo.animate([
                {transform:"translateX(-1px) rotate(0deg)"},
                {transform:"translateX(6px) rotate(2deg)"},
                {transform:"translateX(-8px) rotate(-3deg)"},
                {transform:"translateX(8px) rotate(3deg)"},
                {transform:"translateX(-8px) rotate(-3deg)"},
                {transform:"translateX(8px) rotate(3deg)"},
                {transform:"translateX(-6px) rotate(-2deg)"},
                {transform:"translateX(6px) rotate(2deg)"},
                {transform:"translateX(-2px) rotate(-1deg)"},
                {transform:"translateX(0) rotate(0deg)"}
            ], {
                duration:1200, iterations:1
            });
        };

        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.status == 403) location.reload(); //authorization
            if (xhr.readyState == 4 && xhr.status == 200) {
                let ver = JSON.parse(xhr.responseText);
                if (ver.string) version.innerHTML = "Version " + ver.string;
            }
        };
        xhr.open("GET", "version", true);
        xhr.send();
    }

    ClearCache() {
        const btnOK = this.ConfirmBox("Are you sure you want clear local storage? The page will reload after the cleaning.", false);
        if (btnOK) btnOK.addEventListener("click", () => {
            localStorage.clear();
            location.reload();
        });
    }
}
