"use strict";

class RemoteDesktop extends Window {
	static loadPromise = null;
	static RFB = null;

	constructor(args) {
		super();

		this.args = args ?? {};

		this.AddCssDependencies("vnc.css");

		this.rfb = null;

		this.password = this.args.password ?? null;

		this.SetTitle("VNC");
		this.SetIcon("mono/uvnc.svg");

		this.SetupToolbar();
		this.connectButton    = this.AddToolbarButton("Connect", "mono/connect.svg?light");
		this.AddToolbarSeparator();
		this.cadButton        = this.AddToolbarButton("Send Ctrl+Alt+Del", "mono/keyboard.svg?light");
		this.fitButton        = this.AddToolbarButton("Fit to window", "mono/monitor.svg?light");

		this.canvasBox = document.createElement("div");
		this.canvasBox.className = "vnc-canvas-box";
		this.content.appendChild(this.canvasBox);

		this.statusBox = document.createElement("div");
		this.statusBox.className = "vnc-status-box";
		this.statusBox.textContent = "Connecting...";

		this.connectButton.onclick = ()=> this.Connect();
		this.cadButton.onclick     = ()=> { if (this.rfb) this.rfb.sendCtrlAltDel(); };
		this.fitButton.onclick     = ()=> this.ToggleScaling();

		this.scaleViewport = true;
		this.fitButton.style.borderBottom = "3px solid rgb(192,192,192)";

		if (this.args.host) {
			this.Connect();
		}
	}

	async LoadNoVNC() {
		if (RemoteDesktop.RFB) return RemoteDesktop.RFB;

		RemoteDesktop.loadPromise ??= import("./novnc/core/rfb.js").then(
			module=> RemoteDesktop.RFB = module.default,
			ex=> {
				RemoteDesktop.loadPromise = null; //allow a retry on next attempt
				throw new Error(`Failed to load the noVNC library from ./novnc/ (${ex.message})`);
			}
		);

		return RemoteDesktop.loadPromise;
	}

	async Connect() {
		const host = this.args.host;
		if (!host) return;

		const port = this.args.port || 5900;
		const target = `${host}:${port}`;

		let RFB;
		try {
			RFB = await this.LoadNoVNC();
		}
		catch (ex) {
			this.ConfirmBox(ex.message, true, "mono/error.svg");
			return;
		}

		if (this.rfb) {
			try { this.rfb.disconnect(); } catch {}
			this.rfb = null;
		}

		this.connectButton.disabled = true;

		this.statusBox.style.display = "initial";
		this.statusBox.style.backgroundImage = "url(mono/connect.svg)";
		this.statusBox.textContent = "Connecting...";
		this.content.appendChild(this.statusBox);

		let server = window.location.href.replace("https://", "").replace("http://", "");
		if (server.endsWith("/")) server = server.slice(0, -1);

		const url = (KEEP.isSecure ? "wss://" : "ws://") + server + "/ws/vnc?target=" + encodeURIComponent(target);

		const options = {};
		if (this.password) {
			options.credentials = { password: this.password };
		}

		try {
			this.rfb = new RFB(this.canvasBox, url, options);
		}
		catch (ex) {
			this.statusBox.textContent = ex.message;
			this.connectButton.disabled = false;
			return;
		}

		this.rfb.scaleViewport = this.scaleViewport;
		this.rfb.clipViewport = false;
		this.rfb.background = "transparent";

		//The remote cursor shape is shown by default (Cursor pseudo-encoding);
		//showDotCursor draws a fallback dot when the remote cursor is invisible,
		//so the operator never loses the pointer.
		this.rfb.showDotCursor = true;

		this.rfb.addEventListener("connect", ()=> {
			this.SetTitle(`VNC - ${host}`);
			this.statusBox.style.display = "none";
			this.connectButton.disabled = false;
		});

		this.rfb.addEventListener("disconnect", e=> {
			this.statusBox.style.display = "initial";
			this.statusBox.style.backgroundImage = "url(mono/disconnect.svg)";
			this.statusBox.textContent = e.detail?.clean ? "Connection closed" : "Connection lost";
			this.content.appendChild(this.statusBox);
			this.connectButton.disabled = false;
		});

		this.rfb.addEventListener("securityfailure", e=> {
			this.statusBox.style.display = "initial";
			this.statusBox.textContent = `Authentication failed${e.detail?.reason ? `: ${e.detail.reason}` : ""}`;
		});

		this.rfb.addEventListener("credentialsrequired", ()=> {
			this.PromptCredentials();
		});
	}

	PromptCredentials() {
		const dialog = this.DialogBox("150px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;
		okButton.value = "Connect";

		innerBox.style.padding = "20px";
		innerBox.parentElement.style.maxWidth = "400px";
		innerBox.parentElement.parentElement.onclick = event=> { event.stopPropagation(); };

		const passwordLabel = document.createElement("div");
		passwordLabel.style.display = "inline-block";
		passwordLabel.style.minWidth = "88px";
		passwordLabel.textContent = "Password:";
		const passwordInput = document.createElement("input");
		passwordInput.type = "password";
		passwordInput.style.width = "calc(100% - 120px)";
		innerBox.append(passwordLabel, passwordInput);

		passwordInput.onkeydown = event=> {
			if (event.key === "Enter") okButton.click();
		};

		okButton.onclick = ()=> {
			dialog.Close();
			if (this.rfb) this.rfb.sendCredentials({ password: passwordInput.value });
		};

		setTimeout(()=> passwordInput.focus(), 200);
	}

	ToggleScaling() {
		this.scaleViewport = !this.scaleViewport;
		this.fitButton.style.borderBottom = this.scaleViewport ? "3px solid rgb(192,192,192)" : "none";
		if (this.rfb) this.rfb.scaleViewport = this.scaleViewport;
	}

	Close() { //overrides
		if (this.rfb) {
			try { this.rfb.disconnect(); } catch {}
			this.rfb = null;
		}
		super.Close();
	}
}
