"use strict";

class Vnc extends Window {
	static loadPromise = null;
	static RFB = null;

	constructor(args) {
		super();

		this.args = args ?? {};

		this.AddCssDependencies("vnc.css");

		this.rfb = null;

		this.password = this.args.password ?? null;

		this.SetTitle("VNC");
		this.SetIcon("mono/vnc.svg");

		this.SetupToolbar();
		this.connectButton    = this.AddToolbarButton("Connect", "mono/connect.svg?light");
		this.viewOnlyButton   = this.AddToolbarButton("View only", "mono/lock.svg?light");
		this.AddToolbarSeparator();
		this.cadButton        = this.AddToolbarButton("Send ctrl+alt+del", "mono/cad.svg?light");
		this.sendTextButton   = this.AddToolbarButton("Send key-strokes", "mono/keyboard.svg?light");
		this.clipboardButton  = this.AddToolbarButton("Clipboard sync", "mono/clipboard.svg?light");
		this.AddToolbarSeparator();
		this.fitButton        = this.AddToolbarButton("Fit to window", "mono/fittoscreen.svg?light");
		this.fullScreenButton = this.AddToolbarButton("Full screen", "mono/fullscreen.svg?light");
		this.screenshotButton = this.AddToolbarButton("Save screenshot", "mono/download.svg?light");

		this.canvasBox = document.createElement("div");
		this.canvasBox.className = "vnc-canvas-box";
		this.content.appendChild(this.canvasBox);

		this.statusBox = document.createElement("div");
		this.statusBox.className = "vnc-status-box";
		this.statusBox.textContent = "Connecting...";

		this.connectButton.onclick    = ()=> this.ConnectDialog(this.args.host);
		this.cadButton.onclick        = ()=> { if (this.rfb) this.rfb.sendCtrlAltDel(); };
		this.sendTextButton.onclick   = ()=> this.SendTextDialog();
		this.clipboardButton.onclick  = ()=> this.ToggleClipboardSync();
		this.viewOnlyButton.onclick   = ()=> this.ToggleViewOnly();
		this.fitButton.onclick        = ()=> this.ToggleScaling();
		this.screenshotButton.onclick = ()=> this.SaveScreenshot();

		this.fullScreenButton.onclick = ()=> {
			this.canvasBox.requestFullscreen();
		};

		this.scaleViewport = true;
		this.viewOnly      = false;
		this.clipboardSync = false;
		
		this.fitButton.style.borderBottom = "3px solid rgb(192,192,192)";

		this._lastClipboard = null;
		this._clipboardSyncHandler = ()=> this.SyncClipboardToRemote();
		window.addEventListener("focus", this._clipboardSyncHandler);
		document.addEventListener("visibilitychange", this._clipboardSyncHandler);

		if (this.args.host && this.args.autoconnect !== false) {
			this.SetTitle(`VNC - ${this.args.host}`);
			this.Connect(this.args.host);
		}
		else {
			this.ConnectDialog(this.args.host ?? "", true);
		}
	}

	async LoadNoVNC() {
		if (Vnc.RFB) return Vnc.RFB;

		Vnc.loadPromise ??= import("./novnc/core/rfb.js").then(
			module=> Vnc.RFB = module.default,
			ex=> {
				Vnc.loadPromise = null; //allow a retry on next attempt
				throw new Error(`Failed to load the noVNC library from ./novnc/ (${ex.message})`);
			}
		);

		return Vnc.loadPromise;
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

		const options = {};
		if (this.password) {
			options.credentials = { password: this.password };
		}

		try {
			const url = `${KEEP.isSecure ? "wss" : "ws"}://${window.location.host}/ws/vnc?target=${encodeURIComponent(target)}`;
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

		this.rfb.showDotCursor = true;

		this.rfb.viewOnly = this.viewOnly;

		this._securityFailed = false;

		this.rfb.addEventListener("connect", ()=> {
			this.SetTitle(`VNC - ${host}`);
			this.statusBox.style.display = "none";
			this.connectButton.disabled = true;
		});

		this.rfb.addEventListener("disconnect", e=> {
			this.rfb = null;
			this.connectButton.disabled = false;

			if (this._securityFailed) return;

			this.statusBox.style.display = "initial";
			this.statusBox.style.backgroundImage = "url(mono/disconnect.svg)";
			this.statusBox.textContent = e.detail?.clean ? "Connection closed" : "Connection lost";
			this.content.appendChild(this.statusBox);
		});

		this.rfb.addEventListener("securityfailure", e=> {
			this._securityFailed = true;
			this.statusBox.style.display = "initial";
			this.statusBox.style.backgroundImage = "url(mono/error.svg)";
			this.statusBox.textContent = "Security failure";
			this.connectButton.disabled = false;
			this.PromptPasswordRetry(e.detail?.reason);
		});

		this.rfb.addEventListener("credentialsrequired", ()=> {
			this.PromptCredentials();
		});

		this.rfb.addEventListener("clipboard", e=> {
			if (!this.clipboardSync) return;
			const text = e.detail?.text;
			if (!text) return;
			this._lastClipboard = text;
			navigator.clipboard?.writeText(text).catch(()=> {});
		});
	}

	ConnectDialog(target="", isNew=false) {
		const dialog = this.DialogBox("192px");
		if (dialog === null) return;

		const {okButton, cancelButton, innerBox} = dialog;
		okButton.value = "Connect";

		innerBox.parentElement.style.maxWidth = "400px";
		innerBox.parentElement.parentElement.onclick = event=> event.stopPropagation();

		innerBox.style.margin = "20px 8px 0 8px";

		const hostLabel = document.createElement("div");
		hostLabel.style.display = "inline-block";
		hostLabel.style.minWidth = "88px";
		hostLabel.style.paddingLeft = "8px";
		hostLabel.textContent = "Host:";
		const hostInput = document.createElement("input");
		hostInput.type = "text";
		hostInput.style.width = "calc(100% - 120px)";
		hostInput.value = target ?? "";
		innerBox.append(hostLabel, hostInput);

		const portLabel = document.createElement("div");
		portLabel.style.display = "inline-block";
		portLabel.style.minWidth = "88px";
		portLabel.style.paddingLeft = "8px";
		portLabel.textContent = "Port:";
		const portInput = document.createElement("input");
		portInput.type = "number";
		portInput.min = "1";
		portInput.max = "65535";
		portInput.style.width = "calc(100% - 120px)";
		portInput.value = this.args.port || 5900;
		innerBox.append(portLabel, portInput);

		const passwordLabel = document.createElement("div");
		passwordLabel.style.display = "inline-block";
		passwordLabel.style.minWidth = "88px";
		passwordLabel.style.paddingLeft = "8px";
		passwordLabel.textContent = "Password:";
		const passwordInput = document.createElement("input");
		passwordInput.type = "password";
		passwordInput.style.width = "calc(100% - 120px)";
		passwordInput.value = this.password ?? "";
		innerBox.append(passwordLabel, passwordInput);

		okButton.onclick = ()=> {
			this.args.host = hostInput.value.trim();
			this.args.port = parseInt(portInput.value) || 5900;
			this.password = passwordInput.value.length > 0 ? passwordInput.value : null;

			dialog.Close();
			this.Connect();
		};

		if (isNew) {
			cancelButton.value = "Close";
			cancelButton.onclick = ()=> {
				dialog.Close();
				this.Close();
			};
		}

		hostInput.onkeydown = portInput.onkeydown = passwordInput.onkeydown = event=> {
			if (okButton.disabled) return;
			if (event.key === "Enter") okButton.click();
		};

		hostInput.onchange = hostInput.oninput = ()=> {
			okButton.disabled = hostInput.value.trim().length === 0;
		};

		hostInput.oninput();

		setTimeout(()=> hostInput.focus(), 200);
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

	PromptPasswordRetry(reason) {
		const dialog = this.DialogBox("180px");
		if (dialog === null) return;

		const {okButton, cancelButton, innerBox} = dialog;
		okButton.value = "Retry";

		innerBox.style.padding = "20px";
		innerBox.parentElement.style.maxWidth = "400px";
		innerBox.parentElement.parentElement.onclick = event=> { event.stopPropagation(); };

		const message = document.createElement("div");
		message.textContent = `Authentication failed${reason ? `: ${reason}` : ""}. Please try again.`;
		message.style.paddingBottom = "16px";
		message.style.fontWeight = "600";

		const passwordLabel = document.createElement("div");
		passwordLabel.style.display = "inline-block";
		passwordLabel.style.minWidth = "88px";
		passwordLabel.textContent = "Password:";
		const passwordInput = document.createElement("input");
		passwordInput.type = "password";
		passwordInput.style.width = "calc(100% - 120px)";
		passwordInput.value = this.password ?? "";
		innerBox.append(message, passwordLabel, passwordInput);

		passwordInput.onkeydown = event=> {
			if (event.key === "Enter") okButton.click();
		};

		okButton.onclick = ()=> {
			this.password = passwordInput.value.length > 0 ? passwordInput.value : null;
			dialog.Close();
			this.Connect();
		};

		cancelButton.value = "Cancel";

		setTimeout(()=> {
			passwordInput.focus();
			passwordInput.select();
		}, 200);
	}

	SendTextDialog() {
		if (!this.rfb) return;

		const dialog = this.DialogBox("240px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;
		okButton.value = "Send";

		innerBox.style.padding = "20px";
		innerBox.style.overflow = "hidden";
		innerBox.parentElement.style.maxWidth = "560px";
		innerBox.parentElement.parentElement.onclick = event=> event.stopPropagation();

		const textLabel = document.createElement("div");
		textLabel.textContent = "Text to send as keystrokes (Ctrl+Enter to send):";
		textLabel.style.paddingBottom = "8px";

		const textInput = document.createElement("textarea");
		textInput.style.width = "100%";
		textInput.style.height = "120px";
		textInput.style.boxSizing = "border-box";
		textInput.style.resize = "none";
		textInput.spellcheck = false;
		innerBox.append(textLabel, textInput);

		textInput.onkeydown = event=> {
			if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
				event.preventDefault();
				okButton.click();
			}
		};

		okButton.onclick = ()=> {
			const text = textInput.value;
			dialog.Close();
			this.SendKeystrokes(text);
		};

		setTimeout(()=> textInput.focus(), 200);
	}

	SendKeystrokes(text) {
		if (!this.rfb || !text) return;

		for (const ch of text) {
			let keysym;
			switch (ch) {
			case "\n":
			case "\r": keysym = 0xFF0D; break;
			case "\t": keysym = 0xFF09; break;
			default:
				const cp = ch.codePointAt(0);
				keysym = (cp < 0x100) ? cp : 0x01000000 + cp;
				break;
			}

			this.rfb.sendKey(keysym, null);
		}
	}

	ToggleScaling() {
		this.scaleViewport = !this.scaleViewport;
		this.fitButton.style.borderBottom = this.scaleViewport ? "3px solid rgb(192,192,192)" : "none";
		if (this.rfb) this.rfb.scaleViewport = this.scaleViewport;
	}

	ToggleViewOnly() {
		this.viewOnly = !this.viewOnly;

		this.cadButton.disabled = this.viewOnly;
		this.sendTextButton.disabled = this.viewOnly;

		if (this.rfb) this.rfb.viewOnly = this.viewOnly;
		this.viewOnlyButton.style.borderBottom = this.viewOnly ? "3px solid rgb(192,192,192)" : "none";
	}

	ToggleClipboardSync() {
		this.clipboardSync = !this.clipboardSync;
		this.clipboardButton.style.borderBottom = this.clipboardSync ? "3px solid rgb(192,192,192)" : "none";
	}

	async SyncClipboardToRemote() {
		if (!this.rfb || this.viewOnly) return;
		if (!this.clipboardSync) return;
		if (WIN.focused !== this) return;
		if (!document.hasFocus()) return;
		if (!navigator.clipboard?.readText) return;

		let text;
		try {
			text = await navigator.clipboard.readText();
		}
		catch {
			return;
		}

		if (text && text !== this._lastClipboard) {
			this._lastClipboard = text;
			this.rfb.clipboardPasteFrom(text);
		}
	}

	SaveScreenshot() {
		if (!this.rfb) return;

		this.rfb.toBlob(blob=> {
			if (!blob) return;

			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;

			const host = this.args.host ?? "vnc";
			const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
			link.download = `${host}_${stamp}.png`;

			document.body.appendChild(link);
			link.click();
			link.remove();

			setTimeout(()=> URL.revokeObjectURL(url), 1000);
		});
	}

	Close() { //overrides
		window.removeEventListener("focus", this._clipboardSyncHandler);
		document.removeEventListener("visibilitychange", this._clipboardSyncHandler);

		if (this.rfb) {
			try { this.rfb.disconnect(); } catch {}
			this.rfb = null;
		}
		super.Close();
	}
}
