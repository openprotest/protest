
(function initSettings() {
    sidemenu_dynamicicon      = localStorage.getItem("dynamic_search_icon") === "true";
    $w.always_maxxed          = localStorage.getItem("w_always_maxed") === "true";
    document.body.className   = localStorage.getItem("disable_anime") === "true" ? "disable-animation" : "";
    container.className       = localStorage.getItem("w_disable_dropshadow") === "true" ? "disable-window-dropshadows" : "";

    if (localStorage.getItem("zoom"))
        document.body.style.zoom = 75 + localStorage.getItem("zoom") * 5 + "%";
})();

class Settings extends Tabs {
    constructor() {
        super();
        this.setTitle("Settings");
        this.setIcon("res/tool02.svgz");

        this.tabsContainer.style.width = "150px";
        this.subContent.style.left = "175px";
        this.subContent.style.padding = "24px";
        this.subContent.style.overflowY = "auto";

        this.tabGui     = this.AddTab("Interface", "res/tv.svgz");
        this.tabSession = this.AddTab("Session", "res/hourglass.svgz");
        this.tabLegal   = this.AddTab("Legal", "res/gpl.svgz");

        this.tabGui.onclick = () => this.ShowGui();
        this.tabSession.onclick = () => this.ShowSession();
        this.tabLegal.onclick = () => this.ShowLegal();

        this.tabGui.className = "v-tab-selected";
        this.tabGui.onclick();
    }

    ShowGui() {
        this.subContent.innerHTML = "";        

        this.chkDynamicSearchIcon = document.createElement("input");
        this.chkDynamicSearchIcon.type = "checkbox";
        this.subContent.appendChild(this.chkDynamicSearchIcon);
        this.AddCheckBoxLabel(this.subContent, this.chkDynamicSearchIcon, "Dynamic search icon").style.fontWeight = "500";

        this.subContent.appendChild(document.createElement("br"));
        this.subContent.appendChild(document.createElement("br"));

        this.chkWinMaxxed = document.createElement("input");
        this.chkWinMaxxed.type = "checkbox";
        this.subContent.appendChild(this.chkWinMaxxed);
        this.AddCheckBoxLabel(this.subContent, this.chkWinMaxxed, "Always maximize windows").style.fontWeight = "500";

        this.subContent.appendChild(document.createElement("br"));
        this.subContent.appendChild(document.createElement("br"));

        this.chkDisableAnime = document.createElement("input");
        this.chkDisableAnime.type = "checkbox";
        this.subContent.appendChild(this.chkDisableAnime);
        this.AddCheckBoxLabel(this.subContent, this.chkDisableAnime, "Disable animations").style.fontWeight = "500";

        this.subContent.appendChild(document.createElement("br"));
        this.subContent.appendChild(document.createElement("br"));

        this.chkWindowShadows = document.createElement("input");
        this.chkWindowShadows.type = "checkbox";
        this.subContent.appendChild(this.chkWindowShadows);
        this.AddCheckBoxLabel(this.subContent, this.chkWindowShadows, "Disable window drop-shadows").style.fontWeight = "500";

        this.subContent.appendChild(document.createElement("br"));
        this.subContent.appendChild(document.createElement("br"));

        let divZoom = document.createElement("div");
        divZoom.innerHTML = "Zoom: ";
        divZoom.style.display = "inline-block";
        divZoom.style.minWidth = "200px";
        divZoom.style.fontWeight = "500";
        this.subContent.appendChild(divZoom);

        this.zoom = document.createElement("input");
        this.zoom.type = "range";
        this.zoom.min = "1";
        this.zoom.max = "15";
        this.zoom.value = "5";
        this.zoom.style.width = "200px";
        this.subContent.appendChild(this.zoom);

        let divZoomValue = document.createElement("div");
        divZoomValue.innerHTML = "100%";
        divZoomValue.style.paddingLeft = "8px";
        divZoomValue.style.display = "inline-block";
        this.subContent.appendChild(divZoomValue);

        this.subContent.appendChild(document.createElement("br"));
        this.subContent.appendChild(document.createElement("br"));
        this.subContent.appendChild(document.createElement("hr"));

        let btnClearLocalCache = document.createElement("input");
        btnClearLocalCache.type = "button";
        btnClearLocalCache.value = "Clear local storage";
        btnClearLocalCache.style.height = "36px";
        btnClearLocalCache.style.padding = "8px";
        this.subContent.appendChild(btnClearLocalCache);

        this.chkDynamicSearchIcon.checked = localStorage.getItem("dynamic_search_icon") === "true";
        this.chkWinMaxxed.checked         = localStorage.getItem("w_always_maxed") === "true";
        this.chkDisableAnime.checked      = localStorage.getItem("disable_anime") === "true";
        this.chkWindowShadows.checked     = localStorage.getItem("w_disable_dropshadow") === "true";
        this.zoom.value                   = localStorage.getItem("zoom") == null ? 5 : parseInt(localStorage.getItem("zoom"));

        btnClearLocalCache.onclick = () => { this.ClearCache(); };

        const Apply = () => {
            sidemenu_dynamicicon = this.chkDynamicSearchIcon.checked;
            $w.always_maxxed = this.chkWinMaxxed.checked;
            document.body.className = this.chkDisableAnime.checked ? "disable-animation" : "";
            document.body.style.zoom = 75 + this.zoom.value * 5 + "%";
            divZoomValue.innerHTML = 75 + this.zoom.value * 5 + "%";
            container.className = this.chkWindowShadows.checked ? "disable-window-dropshadows" : "";

            localStorage.setItem("dynamic_search_icon", this.chkDynamicSearchIcon.checked);
            localStorage.setItem("w_always_maxed", this.chkWinMaxxed.checked);
            localStorage.setItem("disable_anime", this.chkDisableAnime.checked);
            localStorage.setItem("w_disable_dropshadow", this.chkWindowShadows.checked);
            localStorage.setItem("zoom", this.zoom.value);
        };

        this.chkDynamicSearchIcon.onclick = Apply;
        this.chkWinMaxxed.onclick         = Apply;
        this.chkDisableAnime.onclick      = Apply;
        this.chkWindowShadows.onclick     = Apply;
        this.zoom.onchange                = Apply;
        this.zoom.oninput = () => { divZoomValue.innerHTML = 75 + this.zoom.value * 5 + "%"; };

        Apply();
    }

    ShowSession() {
        this.subContent.innerHTML = "";

        this.chkAliveOnClose = document.createElement("input");
        this.chkAliveOnClose.type = "checkbox";
        this.subContent.appendChild(this.chkAliveOnClose);
        this.AddCheckBoxLabel(this.subContent, this.chkAliveOnClose, "Keep session alive when browser is closed").style.fontWeight = "500";

        this.subContent.appendChild(document.createElement("br"));
        this.subContent.appendChild(document.createElement("br"));

        let divSessionTimeout = document.createElement("div");
        divSessionTimeout.innerHTML = "Logout if inactive for: ";
        divSessionTimeout.style.display = "inline-block";
        divSessionTimeout.style.minWidth = "200px";
        divSessionTimeout.style.fontWeight = "500";
        this.subContent.appendChild(divSessionTimeout);

        this.sessionTimeout = document.createElement("input");
        this.sessionTimeout.type = "range";
        this.sessionTimeout.min = "1";
        this.sessionTimeout.max = "8";
        this.sessionTimeout.style.width = "200px";
        this.subContent.appendChild(this.sessionTimeout);

        let divSessionTimeoutValue = document.createElement("div");
        divSessionTimeoutValue.innerHTML = "15 min.";
        divSessionTimeoutValue.style.paddingLeft = "8px";
        divSessionTimeoutValue.style.display = "inline-block";
        this.subContent.appendChild(divSessionTimeoutValue);

        this.subContent.appendChild(document.createElement("br"));
        this.subContent.appendChild(document.createElement("br"));
        this.subContent.appendChild(document.createElement("hr"));

        let btnClearLocalCache = document.createElement("input");
        btnClearLocalCache.type = "button";
        btnClearLocalCache.value = "Clear local storage";
        btnClearLocalCache.style.height = "36px";
        btnClearLocalCache.style.padding = "8px";
        this.subContent.appendChild(btnClearLocalCache);

        this.chkAliveOnClose.checked = localStorage.getItem("alive_after_close") === "true";
        this.sessionTimeout.value = localStorage.getItem("session_timeout") == null ? 1 : parseInt(localStorage.getItem("session_timeout"));
 
        btnClearLocalCache.onclick = () => { this.ClearCache() };

        const Apply = () => {
            localStorage.setItem("alive_after_close", this.chkAliveOnClose.checked);
            localStorage.setItem("session_timeout", this.sessionTimeout.value);

            let timeMapping = { 1: 15, 2: 30, 3: 60, 4: 2 * 60, 5: 4 * 60, 6: 8 * 60, 7: 24 * 60, 8: Infinity };
            if (timeMapping[this.sessionTimeout.value] == Infinity) {
                divSessionTimeoutValue.innerHTML = timeMapping[this.sessionTimeout.value];
            } else {
                let value = timeMapping[this.sessionTimeout.value];
                divSessionTimeoutValue.innerHTML = value > 60 ? value / 60 + " hours" : value + " minutes";
            }
        };

        this.chkAliveOnClose.onchange = Apply;
        this.sessionTimeout.oninput = Apply;
        Apply();
    }

    ShowLegal() {
        this.subContent.innerHTML = "";

        let box = document.createElement("div");
        box.style.fontFamily = "monospace";
        box.style.userSelect = "text";
        box.style.webkitUserSelect = "text";
        this.subContent.appendChild(box);

        let xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200) {
                let license = xhr.responseText;
                while (license.indexOf(" ") > -1) license = license.replace(" ", "&nbsp;");
                while (license.indexOf("<") > -1) license = license.replace("<", "&lt;");
                while (license.indexOf(">") > -1) license = license.replace(">", "&gt;");
                while (license.indexOf("\n") > -1) license = license.replace("\n", "<br>");
                box.innerHTML = license;
            } 
        };
        xhr.open("GET", "license.txt", true);
        xhr.send();
    }

    ClearCache() {
        this.ConfirmBox("Are you sure you want clear local storage? The page will reload after the cleaning.", false).addEventListener("click", () => {
            localStorage.clear();
            location.reload();
        });
    }
}
