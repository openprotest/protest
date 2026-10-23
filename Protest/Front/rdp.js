"use strict";

class Rdp extends Window {
	static DEFAULT_PORT = 3389;

	static loadPromise = null;
	static library = null;

	static RESOLUTIONS = [
		{ width:640,  height:480,  name:null },
		{ width:800,  height:600,  name:null },
		{ width:1024, height:768,  name:null },
		{ width:1280, height:720,  name:"HD" },
		{ width:1920, height:1080, name:"Full HD" },
		{ width:2560, height:1440, name:"2K" },
		{ width:3840, height:2160, name:"4K" }
	];

	static ACKNOWLEDGE_STEP = 16384; //well under the gateway's window
	static MAX_POINTER_SIZE = 32; //browsers drop a bigger cursor near the viewport's edge, as IronRDP notes
	static nativeWebSocket = null;

	static permissionShims = 0;
	static clipboardQuery = null;
	static clipboardReadPrompts = null; //true where every clipboard read asks the user, as in Firefox

	//IronErrorKind
	static ERROR_WRONG_PASSWORD       = 1;
	static ERROR_LOGON_FAILURE        = 2;
	static ERROR_ACCESS_DENIED        = 3;
	static ERROR_RDCLEANPATH          = 4;
	static ERROR_PROXY_CONNECT        = 5;
	static ERROR_NEGOTIATION_FAILURE  = 6;

	//the web component sizes itself against the browser viewport, these rules size it against the window instead
	static SHADOW_STYLE = `
		:host > div, div:has(> .screen-wrapper) { width:100%; height:100%; }
		.screen-wrapper:not(.hidden) { display:flex !important; width:100% !important; height:100% !important; overflow:auto !important; }
		.screen-viewer {
			flex:none; margin:auto;
			width:var(--rdp-width) !important; min-width:var(--rdp-width) !important; max-width:var(--rdp-width) !important;
			height:var(--rdp-height) !important; min-height:var(--rdp-height) !important; max-height:var(--rdp-height) !important;
		}
		canvas { display:block; }`;

	constructor(args) {
		super();

		this.args = args ?? Object.create(null);

		Window.AddCssDependencies("rdp.css");

		const isRestored = this.args.autoconnect === false;
		delete this.args.autoconnect;

		//a remembered password is kept in the args, as with SSH, a restored window drops it
		if (isRestored) delete this.args.password;
		this.password = this.args.password ?? null;

		this.element = null;
		this.userInteraction = null;
		this.canvasObserver = null;
		this.connectionId = 0;
		this.connected = false;

		this.scaleToFit = true;
		this.resolution = Rdp.ParseResolution(this.args.resolution); //null matches the window
		this.resizeTimeout = null;
		this.remoteScale = 100;
		this.pointerCache = new Map(); //the server's pointer cache, as cursor styles
		this.clipboardSync = false;
		this.pendingRemoteClipboard = 0; //attempts left to copy the remote clipboard locally
		this.pasteTimeout = null;

		this.SetTitle("RDP");
		this.SetIcon("mono/rdp.svg");

		this.SetupToolbar();

		if (!this.args.isRecording) {
			this.connectButton    = this.AddToolbarButton("Connect", "mono/connect.svg?light");
			this.AddToolbarSeparator();
			this.cadButton        = this.AddToolbarButton("Send ctrl+alt+del", "mono/cad.svg?light");
			this.metaButton       = this.AddToolbarButton("Send meta", "mono/winkey.svg?light");
			this.clipboardButton  = this.AddToolbarButton("Clipboard sync", "mono/clipboard.svg?light");
			this.AddToolbarSeparator();
			this.resolutionDropDown = this.AddToolbarDropdown("mono/resolution.svg?light");
		}

		this.fitButton        = this.AddToolbarButton("Fit to window", "mono/fittoscreen.svg?light");
		this.fullScreenButton = this.AddToolbarButton("Full screen", "mono/fullscreen.svg?light");
		this.screenshotButton = this.AddToolbarButton("Save screenshot", "mono/download.svg?light");

		this.canvasBox = document.createElement("div");
		this.canvasBox.className = "rdp-canvas-box";
		this.content.appendChild(this.canvasBox);

		this.statusBox = document.createElement("div");
		this.statusBox.className = "rdp-status-box";

		this.fitButton.onclick        = ()=> this.ToggleScaling();
		this.fullScreenButton.onclick = ()=> this.canvasBox.requestFullscreen();
		this.screenshotButton.onclick = ()=> this.SaveScreenshot();

		this.fitButton.style.borderBottom = "3px solid rgb(192,192,192)";

		this.resizeObserver = new ResizeObserver(()=> {
			this.UpdateScale();
			this.ScheduleResize();
		});
		this.resizeObserver.observe(this.canvasBox);

		if (this.args.isRecording) return;

		this.SetupResolutionMenu();

		this.connectButton.onclick    = ()=> this.ConnectDialog(this.args.host);
		this.cadButton.onclick        = ()=> { if (this.connected) this.userInteraction.ctrlAltDel(); };
		this.metaButton.onclick       = ()=> { if (this.connected) this.userInteraction.metaKey(); };
		this.clipboardButton.onclick  = ()=> this.ToggleClipboardSync();

		//the component only takes keyboard input while it holds the focus, and it never takes it on click
		this.canvasBox.addEventListener("mousedown", ()=> {
			this.FocusCanvas();
			if (this.pendingRemoteClipboard > 0) this.SyncClipboardToLocal(); //a click is the user action Firefox needs for writing
		}, true);

		//pasting into the session hands it the local clipboard first
		this._pasteKeyHandler = event=> this.OnPasteKey(event);
		this._pasteHandler = event=> this.OnPaste(event);
		window.addEventListener("keydown", this._pasteKeyHandler, true);
		window.addEventListener("paste", this._pasteHandler, true);

		this._clipboardSyncHandler = ()=> {
			if (this.pendingRemoteClipboard > 0) this.SyncClipboardToLocal();
			this.SyncClipboardToRemote();
		};
		window.addEventListener("focus", this._clipboardSyncHandler);
		document.addEventListener("visibilitychange", this._clipboardSyncHandler);

		//full screen takes the screen's resolution, leaving it returns to the selected one
		this._fullscreenHandler = ()=> this.ScheduleResize();
		document.addEventListener("fullscreenchange", this._fullscreenHandler);

		//without credentials the dialog asks for them first
		if (this.args.host && !isRestored && (this.args.credential || this.password !== null)) {
			this.SetTitle(`RDP - ${this.args.host}`);
			this.Connect();
		}
		else {
			this.ConnectDialog(this.args.host ?? "", true);
		}
	}

	async LoadIronRdp() {
		if (Rdp.library) return Rdp.library;

		Rdp.loadPromise ??= Promise.all([
			import("./ironrdp/iron-remote-desktop.js"), //defines the iron-remote-desktop element
			import("./ironrdp/iron-remote-desktop-rdp.js")
		]).then(
			async ([, library])=> {
				await library.init("WARN");
				return Rdp.library = library;
			},
			ex=> {
				Rdp.loadPromise = null; //allow a retry on next attempt
				throw new Error(`Failed to load the IronRDP library from ./ironrdp/ (${ex.message})`);
			}
		);

		return Rdp.loadPromise;
	}

	async Connect() {
		const host = this.args.host;
		if (!host) return;

		const port = this.args.port || Rdp.DEFAULT_PORT;
		const connectionId = ++this.connectionId;

		this.Disconnect();
		this.connectButton.disabled = true;
		this.ShowStatus("mono/connect.svg", "Connecting...");

		let library;
		try {
			library = await this.LoadIronRdp();
		}
		catch (ex) {
			if (connectionId !== this.connectionId) return;
			this.ShowStatus("mono/error.svg", "Failed to load the RDP client");
			this.connectButton.disabled = false;
			this.ConfirmBox(ex.message, true, "mono/error.svg");
			return;
		}

		let username = this.args.username ?? "";
		let password = this.password ?? "";

		if (this.args.credential) {
			const credential = await this.FetchCredential(this.args.credential);
			if (connectionId !== this.connectionId) return;

			if (credential.error) {
				this.ShowStatus("mono/error.svg", credential.error);
				this.connectButton.disabled = false;
				return;
			}

			username = credential.username;
			password = credential.password;
		}

		if (username.length === 0) {
			this.ShowStatus("mono/error.svg", "Credentials are required");
			this.connectButton.disabled = false;
			this.PromptCredentials("Enter credentials for this host.");
			return;
		}

		const {user, domain} = Rdp.SplitUsername(username);

		let userInteraction;
		try {
			userInteraction = await this.CreateComponent(library);
		}
		catch (ex) {
			if (connectionId !== this.connectionId) return;
			this.ShowStatus("mono/error.svg", ex.message);
			this.connectButton.disabled = false;
			return;
		}

		if (connectionId !== this.connectionId) return;

		const fileParam = this.args.file ? `?file=${encodeURIComponent(this.args.file)}` : "";
		const destination = host.includes(":") ? `[${host}]:${port}` : `${host}:${port}`;
		const proxyAddress = `${KEEP.isSecure ? "wss" : "ws"}://${window.location.host}/ws/rdp${fileParam}`;

		const config = userInteraction.configBuilder()
			.withDestination(destination)
			.withProxyAddress(proxyAddress)
			.withAuthToken("protest") //the gateway authenticates the WebSocket by the session cookie, the token is unused
			.withUsername(user)
			.withPassword(password)
			.withServerDomain(domain)
			.withDesktopSize(this.GetDesktopSize())
			.withExtension(library.displayControl(true)) //lets the resolution follow the window
			.build();

		let session;
		let closeReason = "";
		try {
			this.pointerCache.clear();
			Rdp.CaptureWebSocket(proxyAddress, text=> this.OnGatewayMessage(text), reason=> closeReason = reason);
			session = await userInteraction.connect(config);
		}
		catch (ex) {
			if (connectionId !== this.connectionId) return;
			this.OnConnectionFailed(ex, closeReason);
			return;
		}
		finally {
			Rdp.ReleaseWebSocketCapture();
		}

		if (connectionId !== this.connectionId) {
			try { userInteraction.shutdown(); } catch {}
			return;
		}

		this.connected = true;
		this.HideStatus();
		this.SetTitle(`RDP - ${host}`);

		userInteraction.setVisibility(true);
		this.UpdateScale();
		this.FocusCanvas();
		this.ShowToast("This session is being recorded");
		this.ScheduleResize(); //the window may have been resized while connecting

		let reason;
		try {
			const info = await session.run();
			reason = info.reason();
		}
		catch (ex) {
			reason = Rdp.DescribeError(ex, closeReason);
		}

		if (connectionId !== this.connectionId) return;

		this.connected = false;
		this.connectButton.disabled = false;
		this.ShowStatus("mono/disconnect.svg", reason || "Connection closed");
	}

	OnConnectionFailed(ex, closeReason) {
		this.connectButton.disabled = false;

		if (typeof ex?.backtrace === "function") console.error(ex.backtrace());

		const message = Rdp.DescribeError(ex, closeReason);
		this.ShowStatus("mono/error.svg", message);

		const kind = typeof ex?.kind === "function" ? ex.kind() : -1;
		if (kind === Rdp.ERROR_WRONG_PASSWORD || kind === Rdp.ERROR_LOGON_FAILURE) {
			this.PromptCredentials(`${message}. Please try again.`);
		}
	}

	//Creates a fresh web component and resolves with its user interaction API once it has mounted.
	CreateComponent(library) {
		return new Promise((resolve, reject)=> {
			const element = document.createElement("iron-remote-desktop");
			element.module = library.Backend;
			element.setAttribute("scale", "real");
			element.setAttribute("verbose", "false");
			element.setAttribute("flexcenter", "false");

			const releasePermissions = Rdp.AnswerClipboardPermission();

			const timeout = setTimeout(()=> {
				releasePermissions();
				reject(new Error("The RDP client failed to initialize"));
			}, 10_000);

			element.addEventListener("ready", event=> {
				clearTimeout(timeout);

				const userInteraction = event.detail.irgUserInteraction;

				//appended after mounting, the component captures the keyboard only while its first shadow child is the focused root
				const style = document.createElement("style");
				style.textContent = Rdp.SHADOW_STYLE;
				element.shadowRoot.appendChild(style);

				//manual mode, the clipboard is synced only while clipboard sync is on, this must precede the clipboard initialization
				userInteraction.setEnableAutoClipboard(false);
				userInteraction.onClipboardRemoteUpdateCallback(()=> {
					if (!this.clipboardSync) return;
					this.pendingRemoteClipboard = 3;
					this.SyncClipboardToLocal();
				});
				userInteraction.onWarningCallback(message=> console.warn(`IronRDP: ${message}`));

				const canvas = element.shadowRoot.querySelector("canvas");
				if (canvas) {
					this.canvasObserver = new MutationObserver(()=> this.OnCanvasResized());
					this.canvasObserver.observe(canvas, { attributes:true, attributeFilter:["width", "height"] });
				}

				this.userInteraction = userInteraction;

				//the clipboard callbacks are registered after a permission query, a connection made before has no clipboard channel
				Rdp.WaitForClipboardSetup().then(()=> {
					releasePermissions();
					resolve(userInteraction);
				});
			}, { once:true });

			//the component focuses itself whenever the pointer enters, only allow that while this window is focused
			element.shadowRoot.addEventListener("mouseenter", event=> {
				if (WIN.focused !== this) event.stopPropagation();
			}, true);

			element.addEventListener("focusin", ()=> this.SyncClipboardToRemote());

			this.element = element;
			this.canvasBox.appendChild(element);
		});
	}

	//Right after mounting, the component queries the clipboard-read permission and registers its clipboard callbacks
	//once it has the answer. Where the permission can't be queried (Firefox) it reads the clipboard instead, which pops
	//up the browser's paste menu, so while it sets up, such a query answers "prompt". The query is kept for the wait below.
	static AnswerClipboardPermission() {
		const permissions = navigator.permissions;
		if (!permissions?.query) return ()=> {};

		if (Rdp.permissionShims++ === 0) {
			const query = permissions.query;
			permissions.query = descriptor=> {
				const isClipboard = descriptor?.name === "clipboard-read";
				const answer = query.call(permissions, descriptor).catch(ex=> {
					if (isClipboard) return { state:"prompt" };
					throw ex;
				});
				if (isClipboard) Rdp.clipboardQuery = answer;
				return answer;
			};
		}

		let released = false;
		return ()=> {
			if (released) return;
			released = true;
			if (--Rdp.permissionShims === 0) delete permissions.query;
		};
	}

	static async WaitForClipboardSetup() {
		const NextTask = ()=> new Promise(resolve=> setTimeout(resolve, 0));

		await NextTask(); //the component starts its clipboard setup right after the ready event

		const query = Rdp.clipboardQuery;
		Rdp.clipboardQuery = null;
		if (!query) return;

		const timeout = new Promise(resolve=> setTimeout(resolve, 3000));
		await Promise.race([query.catch(()=> {}), timeout]);
		await NextTask(); //the callbacks are registered as soon as the answer arrives
	}

	//IronRDP opens its WebSocket from inside the WebAssembly module, the constructor is wrapped while it connects
	//so the window can send flow control acknowledgements over the same connection, and take the gateway's text messages.
	//IronRDP reads a clean close as the end of the stream, so the gateway's close reason is taken here as well.
	static CaptureWebSocket(url, onText, onClose) {
		Rdp.ReleaseWebSocketCapture();

		const NativeWebSocket = window.WebSocket;
		Rdp.nativeWebSocket = NativeWebSocket;

		function CapturingWebSocket(address, protocols) {
			const socket = protocols === undefined ? new NativeWebSocket(address) : new NativeWebSocket(address, protocols);
			if (String(address) === url) {
				//before IronRDP adds its listeners, it also dispatches a close event of its own when it drops the socket
				socket.addEventListener("close", event=> { if (event.isTrusted) onClose?.(event.reason); });
				Rdp.AcknowledgeMessages(socket, onText);
				Rdp.ReleaseWebSocketCapture();
			}
			return socket;
		}

		CapturingWebSocket.prototype = NativeWebSocket.prototype;
		Object.assign(CapturingWebSocket, { CONNECTING:0, OPEN:1, CLOSING:2, CLOSED:3 });
		window.WebSocket = CapturingWebSocket;
	}

	static ReleaseWebSocketCapture() {
		if (Rdp.nativeWebSocket) {
			window.WebSocket = Rdp.nativeWebSocket;
			Rdp.nativeWebSocket = null;
		}
	}

	//IronRDP decodes and draws each message as soon as its listener gets it, so the bytes handed to the listener tell
	//how far behind the browser is. The gateway lets only a bounded amount of the server's output run ahead of that,
	//past it the server's send queue fills up and the server merges its pending updates, as it does for any slow client.
	//The first acknowledgement also tells the gateway that this window takes its text messages, IronRDP never sees them.
	static AcknowledgeMessages(socket, onText) {
		const addEventListener = socket.addEventListener;
		const removeEventListener = socket.removeEventListener;
		const wrappers = new Map();
		let received = 0, acknowledged = 0;

		const Count = event=> {
			const data = event.data;
			received += data?.byteLength ?? data?.size ?? data?.length ?? 0;
			if (acknowledged > 0 && received - acknowledged < Rdp.ACKNOWLEDGE_STEP) return;
			if (socket.readyState !== socket.OPEN) return;
			acknowledged = received;
			socket.send(String(received));
		};

		addEventListener.call(socket, "message", event=> {
			if (typeof event.data === "string") onText?.(event.data);
		});

		socket.addEventListener = function(type, listener, options) {
			if (type !== "message" || !listener) return addEventListener.call(this, type, listener, options);

			let wrapper = wrappers.get(listener);
			if (!wrapper) {
				wrapper = function(event) {
					if (typeof event.data === "string") return;

					try {
						return typeof listener === "function" ? listener.call(this, event) : listener.handleEvent(event);
					}
					finally {
						Count(event);
					}
				};
				wrappers.set(listener, wrapper);
			}

			return addEventListener.call(this, type, wrapper, options);
		};

		socket.removeEventListener = function(type, listener, options) {
			return removeEventListener.call(this, type, wrappers.get(listener) ?? listener, options);
		};
	}

	OnGatewayMessage(text) {
		let message;
		try {
			message = JSON.parse(text);
		}
		catch {
			return;
		}

		if (message.pointer) this.SetPointer(message);
	}

	//IronRDP 0.7.0 leaves the server's pointer updates unhandled, the gateway decodes them and they become the canvas cursor
	SetPointer(pointer) {
		if (!this.userInteraction) return;

		let style;
		switch (pointer.pointer) {
		case "hidden":
			style = "none";
			break;

		case "default":
			style = "default";
			break;

		case "cached":
			style = this.pointerCache.get(pointer.index) ?? "default";
			break;

		case "new":
			try {
				style = Rdp.PointerStyle(pointer);
			}
			catch {
				style = "default";
			}
			this.pointerCache.set(pointer.index, style);
			break;

		default:
			return;
		}

		this.userInteraction.setCursorStyleOverride(style);
	}

	//The decoded RGBA bitmap as a CSS cursor, scaled down to at most MAX_POINTER_SIZE pixels.
	static PointerStyle(pointer) {
		if (!pointer.width || !pointer.height) return "none";
		if (!pointer.rgba) return "default";

		const bytes = Uint8ClampedArray.from(atob(pointer.rgba), c=> c.charCodeAt(0));

		const source = document.createElement("canvas");
		source.width = pointer.width;
		source.height = pointer.height;
		source.getContext("2d").putImageData(new ImageData(bytes, pointer.width, pointer.height), 0, 0);

		const scale = Math.min(1, Rdp.MAX_POINTER_SIZE / Math.max(pointer.width, pointer.height));
		let image = source;

		if (scale < 1) {
			image = document.createElement("canvas");
			image.width = Math.max(1, Math.round(pointer.width * scale));
			image.height = Math.max(1, Math.round(pointer.height * scale));

			const context = image.getContext("2d");
			context.imageSmoothingQuality = "high";
			context.drawImage(source, 0, 0, image.width, image.height);
		}

		const x = Math.min(Math.round(pointer.x * scale), image.width - 1);
		const y = Math.min(Math.round(pointer.y * scale), image.height - 1);

		return `url(${image.toDataURL("image/png")}) ${x} ${y}, default`;
	}

	Disconnect() {
		this.connected = false;

		if (this.userInteraction) {
			try { this.userInteraction.shutdown(); } catch {}
			this.userInteraction = null;
		}

		if (this.canvasObserver) {
			this.canvasObserver.disconnect();
			this.canvasObserver = null;
		}

		if (this.element) {
			this.element.remove();
			this.element = null;
		}
	}

	async FetchCredential(guid) {
		try {
			const response = await fetch(`vault/credential/get?guid=${encodeURIComponent(guid)}`);
			if (response.status === 401 || response.status === 403) return { error: "Not allowed to read the credentials" };
			if (response.status !== 200) return { error: "Failed to read the credentials" };

			const json = await response.json();
			if (json.error) return { error: json.error };

			return { username: json.username ?? "", password: json.password ?? "" };
		}
		catch {
			return { error: "Failed to read the credentials" };
		}
	}

	static SplitUsername(username) {
		const backslash = username.indexOf("\\");
		if (backslash > 0) {
			return { domain: username.substring(0, backslash), user: username.substring(backslash + 1) };
		}

		//user@domain is passed as is, NTLM accepts UPN names with an empty domain
		return { domain: "", user: username };
	}

	//the gateway's close reason explains a general error, which often only says the stream ended
	static DescribeError(ex, closeReason) {
		if (typeof ex?.kind !== "function") return closeReason || (ex?.message ?? String(ex ?? "Connection failed"));

		switch (ex.kind()) {
		case Rdp.ERROR_WRONG_PASSWORD     : return "Wrong username or password";
		case Rdp.ERROR_LOGON_FAILURE      : return "Logon failure";
		case Rdp.ERROR_ACCESS_DENIED      : return "Access denied";
		case Rdp.ERROR_PROXY_CONNECT      : return "Failed to reach the Pro-test server";
		case Rdp.ERROR_NEGOTIATION_FAILURE: return "The host refused the security protocol";

		case Rdp.ERROR_RDCLEANPATH: {
			const details = ex.rdcleanpathDetails?.();
			switch (details?.wsaErrorCode) {
			case 10060: return "The host did not respond";
			case 10061: return "The host refused the connection";
			case 10065: return "The host is unreachable";
			case 11001: return "Host not found";
			}
			if (details?.wsaErrorCode) return `Failed to connect to the host (error ${details.wsaErrorCode})`;
			if (details?.tlsAlertCode) return "TLS handshake with the host failed";
			return "Failed to connect to the host";
		}

		default: {
			if (closeReason) return closeReason;

			//the first line of the backtrace is the message, prefixed with its source location
			const text = typeof ex.backtrace === "function" ? ex.backtrace() : "";
			return text.split("\n")[0].replace(/^\[[^\]]*\] ?/, "").trim() || "Connection failed";
		}
		}
	}

	//The remote desktop starts at the selected resolution or the window's size, up to 4096x2160 which every server takes,
	//a bigger one is asked for once connected.
	GetDesktopSize() {
		const size = this.resolution ?? Rdp.ClampResolution(this.canvasBox.clientWidth, this.canvasBox.clientHeight);
		let width  = Math.min(size.width, 4096);
		let height = Math.min(size.height, 2160);
		width -= width % 2;
		return { width:width, height:height };
	}

	OnCanvasResized() { //overridable
		this.UpdateScale();
	}

	UpdateScale() {
		const canvas = this.element?.shadowRoot?.querySelector("canvas");
		if (!canvas || !canvas.width || !canvas.height) return;

		let width = canvas.width;
		let height = canvas.height;

		if (this.scaleToFit) {
			const ratio = Math.min(this.canvasBox.clientWidth / width, this.canvasBox.clientHeight / height);
			if (ratio > 0) {
				width  = Math.floor(width * ratio);
				height = Math.floor(height * ratio);
			}
		}
		else if (this.IsFullscreen()) { //full screen runs in device pixels, real size is one remote pixel per device pixel
			const pixelRatio = window.devicePixelRatio || 1;
			width  = Math.floor(width / pixelRatio);
			height = Math.floor(height / pixelRatio);
		}

		this.element.style.setProperty("--rdp-width", `${width}px`);
		this.element.style.setProperty("--rdp-height", `${height}px`);
	}

	FocusCanvas() {
		const canvas = this.element?.shadowRoot?.querySelector("canvas");
		if (canvas) canvas.focus({ preventScroll:true });
	}

	ShowStatus(icon, text) {
		this.statusBox.style.display = "initial";
		this.statusBox.style.backgroundImage = `url(${icon})`;
		this.statusBox.textContent = text;
		this.statusBox.title = text;
		this.content.appendChild(this.statusBox);
	}

	HideStatus() {
		this.statusBox.style.display = "none";
	}

	ConnectDialog(target="", isNew=false) {
		const dialog = this.DialogBox("280px");
		if (dialog === null) return;

		const {okButton, cancelButton, innerBox, buttonBox} = dialog;
		okButton.value = "Connect";

		const dialogBox = innerBox.parentElement;
		dialogBox.style.maxWidth = "440px";
		dialogBox.parentElement.onclick = event=> event.stopPropagation();

		innerBox.style.display = "grid";
		innerBox.style.gridTemplateColumns = "100px minmax(50px, 300px)";
		innerBox.style.alignItems = "center";
		innerBox.style.margin = "20px 20px 0 20px";

		const methodLabel = document.createElement("div");
		methodLabel.style.gridArea = "1 / 1";
		methodLabel.textContent = "Method:";
		const methodBox = new FewBox(["Manual", "Credentials"]);
		methodBox.Select(0);
		methodBox.container.style.gridArea = "1 / 2";
		innerBox.append(methodLabel, methodBox.container);

		const hostLabel = document.createElement("div");
		hostLabel.style.gridArea = "3 / 1";
		hostLabel.textContent = "Host:";
		const hostInput = document.createElement("input");
		hostInput.style.gridArea = "3 / 2";
		hostInput.type = "text";
		hostInput.value = target ?? "";
		innerBox.append(hostLabel, hostInput);

		const portLabel = document.createElement("div");
		portLabel.style.gridArea = "4 / 1";
		portLabel.textContent = "Port:";
		const portInput = document.createElement("input");
		portInput.style.gridArea = "4 / 2";
		portInput.type = "number";
		portInput.min = "1";
		portInput.max = "65535";
		portInput.value = this.args.port || Rdp.DEFAULT_PORT;
		innerBox.append(portLabel, portInput);

		const usernameLabel = document.createElement("div");
		usernameLabel.style.gridArea = "5 / 1";
		usernameLabel.textContent = "Username:";
		const usernameInput = document.createElement("input");
		usernameInput.style.gridArea = "5 / 2";
		usernameInput.type = "text";
		usernameInput.placeholder = "domain\\username";
		usernameInput.value = this.args.username ?? "";
		innerBox.append(usernameLabel, usernameInput);

		const passwordLabel = document.createElement("div");
		passwordLabel.style.gridArea = "6 / 1";
		passwordLabel.textContent = "Password:";
		const passwordInput = document.createElement("input");
		passwordInput.style.gridArea = "6 / 2";
		passwordInput.type = "password";
		innerBox.append(passwordLabel, passwordInput);

		const rememberPasswordToggle = this.CreateToggle("Remember password", false, innerBox);
		rememberPasswordToggle.label.style.gridArea = "7 / 2 / 7 / 4";
		rememberPasswordToggle.label.style.whiteSpace = "nowrap";
		rememberPasswordToggle.label.style.overflow = "hidden";
		rememberPasswordToggle.label.style.textOverflow = "ellipsis";

		if ("password" in this.args) {
			rememberPasswordToggle.checkbox.checked = true;
			passwordInput.value = this.args.password;
		}

		const credentialsLabel = document.createElement("div");
		credentialsLabel.style.gridArea = "5 / 1";
		credentialsLabel.textContent = "Credentials:";
		const credentialsInput = document.createElement("select");
		credentialsInput.style.gridArea = "5 / 2";
		innerBox.append(credentialsLabel, credentialsInput);

		dialogBox.style.transition = ".2s";

		const UpdateOkState = ()=> {
			const host = hostInput.value.trim().length > 0;
			okButton.disabled = !host || (methodBox.index === 1 && !credentialsInput.value);
		};

		const UpdateSelection = ()=> {
			const manual = methodBox.index === 0;

			innerBox.style.gridTemplateRows = manual ? "36px 8px repeat(5, 36px)" : "36px 8px repeat(3, 36px)";
			dialogBox.style.maxHeight = manual ? "320px" : "240px";

			usernameLabel.style.display    = manual ? "initial" : "none";
			usernameInput.style.display    = manual ? "initial" : "none";
			passwordLabel.style.display    = manual ? "initial" : "none";
			passwordInput.style.display    = manual ? "initial" : "none";

			credentialsLabel.style.display = manual ? "none" : "initial";
			credentialsInput.style.display = manual ? "none" : "initial";

			rememberPasswordToggle.label.style.opacity = manual ? 1 : 0;
			rememberPasswordToggle.label.style.display = manual ? "initial" : "none";

			UpdateOkState();
		};

		methodBox.container.onchange = UpdateSelection;

		const SelectVaultEntry = guid=> {
			methodBox.Select(1);
			credentialsInput.value = guid;
			UpdateSelection();
		};

		const listLoaded = (async ()=> {
			try {
				const response = await fetch("vault/credential/list");
				if (response.status === 200) {
					const json = await response.json();
					for (const item of json) {
						credentialsInput.append(new Option(item.name || item.username || item.guid, item.guid));
					}
				}
			}
			catch {}

			if (this.args.credential) {
				SelectVaultEntry(this.args.credential);
			}

			UpdateOkState();
		})();

		this.AddDropTarget(dialogBox, {
			accept     : [Window.DRAG_CREDENTIALS],
			text       : "Drop credentials here...",
			labelParent: buttonBox,
			tip        : "Drop key to auto-fill",
			onDrop     : async (format, guid)=> {
				await listLoaded;
				SelectVaultEntry(guid);
			}
		});

		okButton.onclick = ()=> {
			this.args.host = hostInput.value.trim();
			this.args.port = parseInt(portInput.value) || Rdp.DEFAULT_PORT;

			if (methodBox.index === 0) {
				this.args.username = usernameInput.value.trim();
				this.password = passwordInput.value.length > 0 ? passwordInput.value : null;

				if (rememberPasswordToggle.checkbox.checked && this.password !== null) {
					this.args.password = this.password;
				}
				else {
					delete this.args.password;
				}

				delete this.args.credential;
			}
			else {
				delete this.args.username;
				delete this.args.password;
				this.password = null;
				this.args.credential = credentialsInput.value;
			}

			dialog.Close();
			this.SetTitle(`RDP - ${this.args.host}`);
			this.Connect();
		};

		if (isNew) {
			cancelButton.value = "Close";
			cancelButton.onclick = ()=> {
				dialog.Close();
				this.Close();
			};
		}

		hostInput.onkeydown = portInput.onkeydown = usernameInput.onkeydown = passwordInput.onkeydown = event=> {
			if (okButton.disabled) return;
			if (event.key === "Enter") okButton.click();
		};

		hostInput.onchange = hostInput.oninput = UpdateOkState;

		credentialsInput.onchange = UpdateOkState;

		UpdateSelection();
		setTimeout(()=> methodBox.container.focus(), 200);
	}

	PromptCredentials(text) {
		const dialog = this.DialogBox("200px");
		if (dialog === null) return;

		const {okButton, cancelButton, innerBox} = dialog;
		okButton.value = "Connect";

		innerBox.style.padding = "20px";
		innerBox.parentElement.style.maxWidth = "420px";
		innerBox.parentElement.parentElement.onclick = event=> event.stopPropagation();

		const message = document.createElement("div");
		message.textContent = text;
		message.style.paddingBottom = "16px";
		message.style.fontWeight = "600";

		const usernameLabel = document.createElement("div");
		usernameLabel.style.display = "inline-block";
		usernameLabel.style.minWidth = "88px";
		usernameLabel.textContent = "Username:";
		const usernameInput = document.createElement("input");
		usernameInput.type = "text";
		usernameInput.style.width = "calc(100% - 120px)";
		usernameInput.placeholder = "domain\\username";
		usernameInput.value = this.args.credential ? "" : this.args.username ?? "";

		const passwordLabel = document.createElement("div");
		passwordLabel.style.display = "inline-block";
		passwordLabel.style.minWidth = "88px";
		passwordLabel.style.marginTop = "8px";
		passwordLabel.textContent = "Password:";
		const passwordInput = document.createElement("input");
		passwordInput.type = "password";
		passwordInput.style.width = "calc(100% - 120px)";

		innerBox.append(message, usernameLabel, usernameInput, document.createElement("br"), passwordLabel, passwordInput);

		usernameInput.onkeydown = passwordInput.onkeydown = event=> {
			if (event.key === "Enter") okButton.click();
		};

		okButton.onclick = ()=> {
			this.args.username = usernameInput.value.trim();
			this.password = passwordInput.value.length > 0 ? passwordInput.value : null;
			delete this.args.credential;

			//a remembered password follows the one typed here
			if ("password" in this.args) {
				if (this.password !== null) this.args.password = this.password;
				else delete this.args.password;
			}

			dialog.Close();
			this.Connect();
		};

		cancelButton.value = "Cancel";

		setTimeout(()=> {
			const input = usernameInput.value.length > 0 ? passwordInput : usernameInput;
			input.focus();
		}, 200);
	}

	SetupResolutionMenu() {
		const dropdown = this.resolutionDropDown;
		dropdown.button.setAttribute("aria-label", "Resolution");
		dropdown.menu.style.height = `${(Rdp.RESOLUTIONS.length + 2) * 32 + 4}px`;

		const AddOption = (text, onclick)=> {
			const option = document.createElement("div");
			option.style.paddingLeft = "8px"; //no icons
			option.textContent = text;
			option.onclick = ()=> {
				dropdown.button.blur(); //closes the menu
				onclick();
			};
			dropdown.list.append(option);
			return option;
		};

		this.resolutionOptions = [{ option:AddOption("Match window", ()=> this.SetResolution(null)), resolution:null }];

		for (const preset of Rdp.RESOLUTIONS) {
			const text = `${preset.width} x ${preset.height}${preset.name ? ` (${preset.name})` : ""}`;
			this.resolutionOptions.push({ option:AddOption(text, ()=> this.SetResolution(preset)), resolution:preset });
		}

		this.customResolutionOption = AddOption("Custom...", ()=> this.CustomResolutionDialog());

		this.UpdateResolutionMenu();
	}

	UpdateResolutionMenu() {
		const preset = this.resolution
			? Rdp.RESOLUTIONS.find(o=> o.width === this.resolution.width && o.height === this.resolution.height) ?? null
			: null;
		const isCustom = this.resolution !== null && preset === null;

		for (const {option, resolution} of this.resolutionOptions) {
			const selected = resolution === null ? this.resolution === null : resolution === preset;
			option.style.backgroundColor = selected ? "var(--clr-select)" : "";
		}

		this.customResolutionOption.textContent = isCustom ? `Custom (${this.resolution.width} x ${this.resolution.height})` : "Custom...";
		this.customResolutionOption.style.backgroundColor = isCustom ? "var(--clr-select)" : "";
	}

	//null matches the window, the choice is kept in the args so a restored window keeps it
	SetResolution(resolution) {
		this.resolution = resolution ? Rdp.ClampResolution(resolution.width, resolution.height) : null;
		this.args.resolution = this.resolution ? `${this.resolution.width}x${this.resolution.height}` : "window";
		this.UpdateResolutionMenu();
		this.ScheduleResize();
	}

	CustomResolutionDialog() {
		const dialog = this.DialogBox("170px");
		if (dialog === null) return;

		const {okButton, cancelButton, innerBox} = dialog;
		okButton.value = "Apply";

		innerBox.style.padding = "20px";
		innerBox.parentElement.style.maxWidth = "360px";
		innerBox.parentElement.parentElement.onclick = event=> event.stopPropagation();

		const current = this.resolution ?? this.GetTargetResolution(1);

		const widthLabel = document.createElement("div");
		widthLabel.style.display = "inline-block";
		widthLabel.style.minWidth = "72px";
		widthLabel.textContent = "Width:";
		const widthInput = document.createElement("input");
		widthInput.type = "number";
		widthInput.min = "640";
		widthInput.max = "8192";
		widthInput.step = "2";
		widthInput.style.width = "120px";
		widthInput.value = current.width;

		const heightLabel = document.createElement("div");
		heightLabel.style.display = "inline-block";
		heightLabel.style.minWidth = "72px";
		heightLabel.style.marginTop = "8px";
		heightLabel.textContent = "Height:";
		const heightInput = document.createElement("input");
		heightInput.type = "number";
		heightInput.min = "480";
		heightInput.max = "8192";
		heightInput.style.width = "120px";
		heightInput.value = current.height;

		innerBox.append(widthLabel, widthInput, document.createElement("br"), heightLabel, heightInput);

		const UpdateOkState = ()=> {
			okButton.disabled = !(parseInt(widthInput.value) > 0 && parseInt(heightInput.value) > 0);
		};
		widthInput.oninput = heightInput.oninput = UpdateOkState;

		widthInput.onkeydown = heightInput.onkeydown = event=> {
			if (event.key === "Enter" && !okButton.disabled) okButton.click();
		};

		okButton.onclick = ()=> {
			dialog.Close();
			this.SetResolution({ width:parseInt(widthInput.value), height:parseInt(heightInput.value) });
		};

		cancelButton.value = "Cancel";

		setTimeout(()=> {
			widthInput.focus();
			widthInput.select();
		}, 200);
	}

	ScheduleResize() {
		if (this.args.isRecording) return;

		clearTimeout(this.resizeTimeout);
		this.resizeTimeout = setTimeout(()=> {
			const canvas = this.element?.shadowRoot?.querySelector("canvas");
			if (!this.connected || !canvas) return;

			let target;
			if (this.IsFullscreen()) {
				target = this.GetTargetResolution(window.devicePixelRatio || 1);
			}
			else if (this.resolution) {
				target = { ...this.resolution, scale:100 };
			}
			else {
				target = this.GetTargetResolution(1);
			}

			if (target.width === canvas.width && target.height === canvas.height && target.scale === this.remoteScale) return;

			this.remoteScale = target.scale;
			this.userInteraction.resize(target.width, target.height, target.scale);
		}, 400);
	}

	//In device pixels with a matching scale factor, so the remote desktop is as sharp as the screen and its text keeps
	//its size.
	GetTargetResolution(pixelRatio) {
		const size = Rdp.ClampResolution(Math.round(this.canvasBox.clientWidth * pixelRatio), Math.round(this.canvasBox.clientHeight * pixelRatio));
		const scale = Math.min(Math.max(Math.round(pixelRatio * 100), 100), 500);
		return { width:size.width, height:size.height, scale:scale };
	}

	//Within what the display control channel takes, the width has to be even.
	static ClampResolution(width, height) {
		width  = Math.min(Math.max(width,  640), 8192);
		height = Math.min(Math.max(height, 480), 8192);
		return { width:width - width % 2, height:height };
	}

	//"window" or "WIDTHxHEIGHT", as kept in the args
	static ParseResolution(value) {
		const match = /^(\d+)x(\d+)$/.exec(value ?? "");
		return match ? Rdp.ClampResolution(parseInt(match[1]), parseInt(match[2])) : null;
	}

	IsFullscreen() {
		return document.fullscreenElement === this.canvasBox;
	}

	ToggleScaling() {
		this.scaleToFit = !this.scaleToFit;
		this.fitButton.style.borderBottom = this.scaleToFit ? "3px solid rgb(192,192,192)" : "none";
		this.UpdateScale();
	}

	async ToggleClipboardSync() {
		this.clipboardSync = !this.clipboardSync;
		this.clipboardButton.style.borderBottom = this.clipboardSync ? "3px solid rgb(192,192,192)" : "none";

		if (this.clipboardSync) {
			if (!window.isSecureContext) {
				this.ConfirmBox("Clipboard sync is available only over HTTPS.", true, "mono/clipboard.svg");
			}
			await Rdp.DetectClipboardPrompts();
			this.SyncClipboardToRemote();
		}
	}

	//Firefox can't be asked about the clipboard-read permission, it asks the user on every read instead
	static async DetectClipboardPrompts() {
		if (Rdp.clipboardReadPrompts !== null) return;

		try {
			await Permissions.prototype.query.call(navigator.permissions, { name:"clipboard-read" });
			Rdp.clipboardReadPrompts = false;
		}
		catch {
			Rdp.clipboardReadPrompts = true;
		}
	}

	//Writing to the local clipboard needs the document's focus, and in Firefox a recent user action too,
	//so a failed write is retried on the next focus, click or key press in this window.
	async SyncClipboardToLocal() {
		if (!this.connected || !this.clipboardSync) return;

		if (this.pendingRemoteClipboard <= 0) return;
		if (!document.hasFocus()) return; //retried on focus, without using up an attempt

		this.pendingRemoteClipboard--;
		try {
			await this.userInteraction.saveRemoteClipboardData();
			this.pendingRemoteClipboard = 0;
		}
		catch {}
	}

	//On focus the local clipboard is handed over ahead of time, except where every read asks the user (Firefox),
	//there it is handed over when pasting, see OnPasteKey.
	async SyncClipboardToRemote() {
		if (Rdp.clipboardReadPrompts !== false) return;
		await this.SendClipboardToRemote();
	}

	async SendClipboardToRemote() {
		if (!this.connected || !this.clipboardSync) return;
		if (WIN.focused !== this || !document.hasFocus()) return;

		try {
			await this.userInteraction.sendClipboardData();
		}
		catch {}
	}

	//Ctrl+V, Cmd+V or Shift+Insert inside the session. The key is kept from the component and left to the browser,
	//whose paste event carries the local clipboard without asking for permission, see OnPaste.
	OnPasteKey(event) {
		if (this.pendingRemoteClipboard > 0 && WIN.focused === this) this.SyncClipboardToLocal();

		if (!this.connected || !this.clipboardSync || event.repeat) return;
		if (document.activeElement !== this.element) return;

		const isPaste = event.code === "KeyV" && (event.ctrlKey || event.metaKey) && !event.altKey
			|| event.code === "Insert" && event.shiftKey && !event.ctrlKey;
		if (!isPaste) return;

		event.stopImmediatePropagation();

		clearTimeout(this.pasteTimeout);
		this.pasteTimeout = setTimeout(()=> this.PasteToRemote(null), 200); //no paste event, read the clipboard instead
	}

	OnPaste(event) {
		if (!this.connected || !this.clipboardSync) return;
		if (document.activeElement !== this.element) return;

		event.preventDefault();
		clearTimeout(this.pasteTimeout);
		this.PasteToRemote(event.clipboardData);
	}

	//hands the local clipboard to the session, then presses ctrl+v there
	async PasteToRemote(clipboardData) {
		if (clipboardData) {
			const types = {};
			for (const type of ["text/plain", "text/html"]) {
				const value = clipboardData.getData(type);
				if (value) types[type] = new Blob([value], { type:type });
			}

			const image = Array.from(clipboardData.files ?? []).find(file=> file.type === "image/png");
			if (image) types["image/png"] = image;

			if (Object.keys(types).length > 0) {
				await Rdp.WithClipboardContent(types, ()=> this.userInteraction?.sendClipboardData());
			}
		}
		else {
			await this.SendClipboardToRemote();
		}

		if (this.connected) this.userInteraction.ctrlV();
	}

	//The component reads the local clipboard itself, for a paste it is handed what the paste event carried instead.
	static async WithClipboardContent(types, action) {
		const clipboard = navigator.clipboard;
		if (!clipboard) return;

		const text = types["text/plain"] ? await types["text/plain"].text() : "";
		clipboard.read = async ()=> [new ClipboardItem(types)];
		clipboard.readText = async ()=> text;

		try {
			await action();
		}
		catch {}
		finally {
			delete clipboard.read;
			delete clipboard.readText;
		}
	}

	SaveScreenshot() {
		const canvas = this.element?.shadowRoot?.querySelector("canvas");
		if (!canvas || !this.connected) return;

		canvas.toBlob(blob=> {
			if (!blob) return;

			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;

			const host = this.args.host ?? "rdp";
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
		document.removeEventListener("fullscreenchange", this._fullscreenHandler);
		window.removeEventListener("keydown", this._pasteKeyHandler, true);
		window.removeEventListener("paste", this._pasteHandler, true);

		this.connectionId++;
		clearTimeout(this.resizeTimeout);
		clearTimeout(this.pasteTimeout);
		this.resizeObserver.disconnect();
		this.Disconnect();

		super.Close();
	}
}

class RdpRecording extends Rdp {
	static SPEED_STEPS = [.5, 1, 2, 4, 8, 16];

	constructor(args) {
		super({ ...(args ?? {}), isRecording: true });

		Window.AddCssDependencies("recordingplayback.css");

		this.canvasBox.style.bottom = "72px";
		this.canvasBox.style.pointerEvents = "none"; //the player's input never reaches anything

		this.meta = null;
		this.durationMs = 0;
		this.currentMs = 0;
		this.playing = true;
		this.speed = 1;
		this.ended = false;

		this.controlSocket = null;

		this.SetTitle("RDP recording");
		this.SetIcon("mono/playback.svg");

		this.AddToolbarSeparator();
		this.AddSendToChatButton();

		this.timelineBox = document.createElement("div");
		this.timelineBox.className = "vr-timeline";
		this.content.appendChild(this.timelineBox);

		this.timeLabel = document.createElement("div");
		this.timeLabel.className = "vr-time";
		this.timeLabel.textContent = "00:00 / 00:00";
		this.timelineBox.appendChild(this.timeLabel);

		this.speedLabel = document.createElement("div");
		this.speedLabel.className = "vr-speed-label";
		this.timelineBox.appendChild(this.speedLabel);

		this.track = document.createElement("div");
		this.track.className = "vr-track";
		this.timelineBox.appendChild(this.track);

		this.progress = document.createElement("div");
		this.progress.className = "vr-progress";
		this.progress.style.backgroundColor = "#606060";
		this.track.appendChild(this.progress);

		this.playhead = document.createElement("div");
		this.playhead.className = "vr-playhead";
		this.track.appendChild(this.playhead);

		const controlsRow = document.createElement("div");
		controlsRow.className = "vr-controls";
		this.timelineBox.appendChild(controlsRow);

		this.playPauseButton = document.createElement("button");
		this.playPauseButton.className = "vr-button";
		this.playPauseButton.style.backgroundImage = "url(mono/pause.svg)";
		this.playPauseButton.style.left = "8px";
		this.timelineBox.appendChild(this.playPauseButton);

		this.rewindButton = document.createElement("button");
		this.rewindButton.className = "vr-button";
		this.rewindButton.style.backgroundImage = "url(mono/rewind.svg)";
		this.rewindButton.style.right = "40px";
		this.timelineBox.appendChild(this.rewindButton);

		this.fastForwardButton = document.createElement("button");
		this.fastForwardButton.className = "vr-button";
		this.fastForwardButton.style.backgroundImage = "url(mono/fastforward.svg)";
		this.fastForwardButton.style.right = "8px";
		this.timelineBox.appendChild(this.fastForwardButton);

		this.rewindButton.onclick      = ()=> this.StepSpeed(-1);
		this.playPauseButton.onclick   = ()=> this.ended ? this.RestartPlayback() : this.TogglePlayback();
		this.fastForwardButton.onclick = ()=> this.StepSpeed(1);

		this.UpdateSpeedDisplay();

		this._tickHandle = setInterval(()=> this.UpdateClockDisplay(), 200);

		this.Load();
	}

	async Load() {
		this.ShowStatus("mono/connect.svg", "Loading recording...");

		let meta;
		try {
			const response = await fetch(`/recordings/meta?protocol=rdp&id=${encodeURIComponent(this.args.recordingId)}`);
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
			meta = await response.json();
			if (meta.error) throw meta.error;
		}
		catch {
			this.ShowStatus("mono/error.svg", "Failed to load recording");
			return;
		}

		this.meta = meta;
		this.durationMs = meta.durationMs || 0;

		this.SetTitle(`RDP recording - ${meta.host} (${new Date(meta.start).toLocaleString()})`);

		try {
			await this.LoadIronRdp();
		}
		catch (ex) {
			this.ShowStatus("mono/error.svg", ex.message);
			return;
		}

		this.ConnectPlayback(0);
	}

	//the recorded stream is replayed into a fresh client through the RDCleanPath playback endpoint, paced by a control connection
	async ConnectPlayback(startMs) {
		this.TeardownPlayback();

		const connectionId = this.connectionId;

		this.currentMs = startMs;
		this.ended = false;

		this.ShowStatus("mono/connect.svg", "Loading recording...");

		const key = Array.from(crypto.getRandomValues(new Uint8Array(16)), b=> b.toString(16).padStart(2, "0")).join("");
		const url = `${KEEP.isSecure ? "wss" : "ws"}://${window.location.host}/ws/recordingplayback?protocol=rdp&id=${encodeURIComponent(this.args.recordingId)}&t=${Math.round(startMs)}&key=${key}`;

		const controlSocket = new WebSocket(`${url}&control=1`);
		this.controlSocket = controlSocket;

		const opened = await new Promise(resolve=> {
			controlSocket.onopen  = ()=> resolve(true);
			controlSocket.onerror = ()=> resolve(false);
			controlSocket.onclose = ()=> resolve(false);
		});

		if (connectionId !== this.connectionId) return;

		if (!opened) {
			this.ShowStatus("mono/error.svg", "Failed to load recording");
			return;
		}

		//the stream is cut at the end of the recording as well, the server announces the end first
		let reachedEnd = false;

		//IronRDP resizes its canvas only for resizes it requested, the server announces the recorded ones ahead of time
		this.recordedSize = null;
		controlSocket.onmessage = event=> {
			let message;
			try { message = JSON.parse(event.data); } catch { return; }

			if (message.event === "end") {
				reachedEnd = true;
				return;
			}

			if (message.event !== "resize") return;

			this.recordedSize = { width:message.width, height:message.height };
			this.ApplyRecordedSize();
		};

		if (!this.playing) this.SendControl({ cmd: "pause" });
		if (this.speed !== 1) this.SendControl({ cmd: "speed", x: this.speed });

		let userInteraction;
		try {
			userInteraction = await this.CreateComponent(Rdp.library);
		}
		catch (ex) {
			if (connectionId !== this.connectionId) return;
			this.ShowStatus("mono/error.svg", ex.message);
			return;
		}

		if (connectionId !== this.connectionId) return;

		//the recording starts after CredSSP, the player connects with TLS only and placeholder credentials
		const config = userInteraction.configBuilder()
			.withDestination(`${this.meta.host}:${this.meta.port}`)
			.withProxyAddress(url)
			.withAuthToken("protest")
			.withUsername("playback")
			.withPassword("playback")
			.withExtension(Rdp.library.enableCredssp(false))
			.build();

		let session;
		try {
			session = await userInteraction.connect(config);
		}
		catch (ex) {
			if (connectionId !== this.connectionId) return;
			if (typeof ex?.backtrace === "function") console.error(ex.backtrace());
			this.ShowStatus("mono/error.svg", "Failed to play the recording");

			//the play button starts over
			this.playing = false;
			this.ended = true;
			this.playPauseButton.style.backgroundImage = "url(mono/play.svg)";
			return;
		}

		if (connectionId !== this.connectionId) return;

		this.connected = true;
		this.HideStatus();

		userInteraction.setVisibility(true);
		this.UpdateScale();

		let failure = null;
		try {
			await session.run();
		}
		catch (ex) {
			failure = ex;
		}

		if (connectionId !== this.connectionId) return;

		this.connected = false;
		this.playing = false;
		this.ended = true;
		this.playPauseButton.style.backgroundImage = "url(mono/play.svg)";

		if (failure && !reachedEnd) {
			if (typeof failure?.backtrace === "function") console.error(failure.backtrace());
			this.ShowStatus("mono/error.svg", Rdp.DescribeError(failure));
			return;
		}

		this.currentMs = this.durationMs;
		this.UpdateClockDisplay();
	}

	OnCanvasResized() { //overrides
		this.ApplyRecordedSize();
		this.UpdateScale();
	}

	//The playback server gives IronRDP the largest desktop of the recording, so its surface never has to be resized.
	//The canvas shows the part the recorded desktop takes at the moment. IronRDP sizes the canvas when it starts and may
	//draw right away, resizing clears a canvas, so what is drawn is kept.
	ApplyRecordedSize() {
		const canvas = this.element?.shadowRoot?.querySelector("canvas");
		const size = this.recordedSize;
		if (!canvas || !size || (canvas.width === size.width && canvas.height === size.height)) return;

		const kept = document.createElement("canvas");
		kept.width = Math.max(1, Math.min(canvas.width, size.width));
		kept.height = Math.max(1, Math.min(canvas.height, size.height));
		kept.getContext("2d").drawImage(canvas, 0, 0);

		canvas.width = size.width;
		canvas.height = size.height;
		canvas.getContext("2d").drawImage(kept, 0, 0);
	}

	TeardownPlayback() {
		this.connectionId++;

		if (this.controlSocket) {
			try { this.controlSocket.close(); } catch {}
			this.controlSocket = null;
		}

		this.Disconnect();
	}

	SendControl(obj) {
		if (this.controlSocket && this.controlSocket.readyState === WebSocket.OPEN) {
			this.controlSocket.send(JSON.stringify(obj));
		}
	}

	TogglePlayback() {
		this.playing = !this.playing;
		this.SendControl({ cmd: this.playing ? "play" : "pause" });
		this.playPauseButton.style.backgroundImage = this.playing ? "url(mono/pause.svg)" : "url(mono/play.svg)";
	}

	RestartPlayback() {
		this.playing = true;
		this.playPauseButton.style.backgroundImage = "url(mono/pause.svg)";
		this.ConnectPlayback(0);
	}

	StepSpeed(direction) {
		const steps = RdpRecording.SPEED_STEPS;
		const index = steps.indexOf(this.speed);
		const nextIndex = Math.min(steps.length - 1, Math.max(0, index + direction));
		if (nextIndex === index) return;

		this.speed = steps[nextIndex];
		this.SendControl({ cmd: "speed", x: this.speed });
		this.UpdateSpeedDisplay();
	}

	UpdateSpeedDisplay() {
		const steps = RdpRecording.SPEED_STEPS;
		this.speedLabel.textContent = this.speed === 1 ? "" : `${this.speed}x`;
		this.rewindButton.disabled = this.speed <= steps[0];
		this.fastForwardButton.disabled = this.speed >= steps[steps.length - 1];
	}

	UpdateClockDisplay() {
		if (!this.durationMs) return;

		if (this.playing && this.connected) {
			this.currentMs = Math.min(this.durationMs, this.currentMs + 200 * this.speed);
		}

		const ratio = Math.min(1, this.currentMs / this.durationMs);
		this.progress.style.width = `${ratio * 100}%`;
		this.playhead.style.left = `${ratio * 100}%`;
		this.timeLabel.textContent = `${this.FormatTime(this.currentMs)} / ${this.FormatTime(this.durationMs)}`;
	}

	FormatTime(ms) {
		const totalSeconds = Math.floor(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
	}

	Close() { //overrides
		clearInterval(this._tickHandle);
		this.TeardownPlayback();
		super.Close();
	}
}
