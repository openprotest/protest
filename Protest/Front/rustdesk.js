"use strict";

//Protocol buffers, as much as the RustDesk window reads and writes. Reading collects the fields of a message by number,
//each as a list: a repeated field comes many times, and of a single one the last is the one that counts.
class RustDeskProto {
	static decoder = new TextDecoder();
	static encoder = new TextEncoder();

	constructor() {
		this.parts = [];
		this.scratch = [];
	}

	static Read(bytes) {
		const fields = Object.create(null);
		const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		let i = 0;

		while (i < bytes.length) {
			let tag, value;
			[tag, i] = RustDeskProto.ReadVarint(bytes, i);
			tag = Number(tag);

			const field = Math.floor(tag / 8);
			switch (tag % 8) {
			case 0:
				[value, i] = RustDeskProto.ReadVarint(bytes, i);
				break;

			case 1: //the only fixed64 read is a double
				if (i + 8 > bytes.length) throw new Error("Truncated message");
				value = view.getFloat64(i, true);
				i += 8;
				break;

			case 2: {
				let length;
				[length, i] = RustDeskProto.ReadVarint(bytes, i);
				if (typeof length !== "number" || i + length > bytes.length) throw new Error("Truncated message");
				value = bytes.subarray(i, i + length);
				i += length;
				break;
			}

			case 5:
				if (i + 4 > bytes.length) throw new Error("Truncated message");
				value = view.getFloat32(i, true);
				i += 4;
				break;

			default:
				throw new Error("Invalid wire type");
			}

			if (field === 0) throw new Error("Invalid field");
			(fields[field] ??= []).push(value);
		}

		return fields;
	}

	//a number while it is exact, past 2^49 a bigint, as a 64-bit id would lose its low bits
	static ReadVarint(bytes, i) {
		const start = i;
		let value = 0, scale = 1, byte, count = 0;

		do {
			if (i >= bytes.length || ++count > 10) throw new Error("Invalid varint");
			byte = bytes[i++];
			value += (byte & 0x7f) * scale;
			scale *= 128;
		} while (byte & 0x80);

		if (count > 7) {
			let big = 0n;
			for (let j = i - 1; j >= start; j--) {
				big = big << 7n | BigInt(bytes[j] & 0x7f);
			}
			return [BigInt.asUintN(64, big), i];
		}

		return [value, i];
	}

	//the last value of a field, or the fallback when the message leaves it out
	static Get(fields, field, fallback=0) {
		const list = fields[field];
		return list ? list[list.length - 1] : fallback;
	}

	static Int32(value) {
		return typeof value === "bigint" ? Number(BigInt.asIntN(32, value)) : value | 0;
	}

	static Sint32(value) {
		const n = RustDeskProto.Int32(value) >>> 0;
		return (n >>> 1) ^ -(n & 1);
	}

	static String(value) {
		return value instanceof Uint8Array ? RustDeskProto.decoder.decode(value) : "";
	}

	Varint(field, value) {
		if (!value) return this; //proto3 leaves defaults out
		return this.OneofVarint(field, value);
	}

	//a member of a oneof goes out even with its default value, its presence is what tells the member apart
	OneofVarint(field, value) {
		this.WriteVarint(field * 8);
		this.WriteVarint(value);
		return this;
	}

	Sint32(field, value) {
		return this.Varint(field, ((value << 1) ^ (value >> 31)) >>> 0);
	}

	Bool(field, value) {
		return this.Varint(field, value ? 1 : 0);
	}

	Enums(field, values) {
		for (const value of values) this.OneofVarint(field, value);
		return this;
	}

	Bytes(field, bytes) {
		if (!bytes?.length) return this;
		this.WriteVarint(field * 8 + 2);
		this.WriteVarint(bytes.length);
		this.Append(bytes);
		return this;
	}

	String(field, text) {
		return this.Bytes(field, RustDeskProto.encoder.encode(text ?? ""));
	}

	Message(field, message) {
		const bytes = message.ToArray();
		this.WriteVarint(field * 8 + 2);
		this.WriteVarint(bytes.length);
		this.Append(bytes);
		return this;
	}

	ToArray() {
		this.Flush();

		let length = 0;
		for (const part of this.parts) length += part.length;

		const bytes = new Uint8Array(length);
		let offset = 0;
		for (const part of this.parts) {
			bytes.set(part, offset);
			offset += part.length;
		}

		return bytes;
	}

	WriteVarint(value) {
		if (typeof value === "bigint") {
			value = BigInt.asUintN(64, value);
			while (value >= 0x80n) {
				this.scratch.push(Number(value & 0x7fn) | 0x80);
				value >>= 7n;
			}
			this.scratch.push(Number(value));
			return;
		}

		while (value >= 0x80) {
			this.scratch.push(value % 128 | 0x80);
			value = Math.floor(value / 128);
		}
		this.scratch.push(value);
	}

	Append(bytes) {
		this.Flush();
		this.parts.push(bytes);
	}

	Flush() {
		if (this.scratch.length === 0) return;
		this.parts.push(Uint8Array.from(this.scratch));
		this.scratch = [];
	}
}

class RustDesk extends Window {
	static DEFAULT_PORT = 21118; //direct IP access
	static MAX_CURSOR_SIZE = 32; //browsers drop a bigger cursor near the viewport's edge, as with RDP
	static MAX_CLIPBOARD_LENGTH = 8 * 1024 * 1024;

	static zstd = null;
	static zstdPromise = null;
	static codecs = null;

	//the union of Message, by field number
	static MSG_TEST_DELAY       = 5;
	static MSG_VIDEO_FRAME      = 6;
	static MSG_LOGIN_RESPONSE   = 8;
	static MSG_MOUSE_EVENT      = 10;
	static MSG_CURSOR_DATA      = 12;
	static MSG_CURSOR_ID        = 14;
	static MSG_KEY_EVENT        = 15;
	static MSG_CLIPBOARD        = 16;
	static MSG_MISC             = 19;
	static MSG_MESSAGE_BOX      = 21;
	static MSG_PEER_INFO        = 25;
	static MSG_MULTI_CLIPBOARDS = 28;

	//the codecs of VideoFrame's union, by field number, and how WebCodecs names them
	static VIDEO_CODECS = {
		6:  { name:"vp9",  codec:"vp09.00.10.08" },
		12: { name:"vp8",  codec:"vp8" },
		13: { name:"av1",  codec:"av01.0.08M.08" },
		10: { name:"h264", codec:"avc1.640033" },
		11: { name:"h265", codec:"hev1.1.6.L153.B0" }
	};

	static MOUSE_TYPE_MOVE  = 0;
	static MOUSE_TYPE_DOWN  = 1;
	static MOUSE_TYPE_UP    = 2;
	static MOUSE_TYPE_WHEEL = 3;
	static MOUSE_BUTTONS = [0x01, 0x04, 0x02, 0x08, 0x10]; //by MouseEvent.button: left, wheel, right, back, forward

	static KEYBOARD_MODE_LEGACY = 0;
	static KEYBOARD_MODE_MAP    = 1;

	static CONTROL_KEY_ALT          = 1;
	static CONTROL_KEY_CONTROL      = 4;
	static CONTROL_KEY_DELETE       = 5;
	static CONTROL_KEY_META         = 23;
	static CONTROL_KEY_RETURN       = 27;
	static CONTROL_KEY_SHIFT        = 29;
	static CONTROL_KEY_CTRL_ALT_DEL = 100;

	//the named keys of the legacy keyboard mode, for a host whose key codes aren't known
	static LEGACY_KEYS = {
		Alt:1, Backspace:2, CapsLock:3, Control:4, Delete:5, ArrowDown:6, End:7, Escape:8,
		F1:9, F10:10, F11:11, F12:12, F2:13, F3:14, F4:15, F5:16, F6:17, F7:18, F8:19, F9:20,
		Home:21, ArrowLeft:22, Meta:23, PageDown:25, PageUp:26, Enter:27, ArrowRight:28, Shift:29,
		" ":30, Tab:31, ArrowUp:32, Pause:46, PrintScreen:55, Insert:58, ScrollLock:62, NumLock:63, ContextMenu:65
	};

	//KeyboardEvent.code as the Windows scan code, the Linux (X11) key code and the macOS virtual key code, from the
	//tables of rdev, which RustDesk's own clients use in map mode; 0 or -1 where the platform has no such key
	static KEY_CODES = {
		AltLeft:         [0x0038,  64,  58],
		AltRight:        [0xE038, 108,  61],
		Backspace:       [0x000E,  22,  51],
		CapsLock:        [0x003A,  66,  57],
		ControlLeft:     [0x001D,  37,  59],
		ControlRight:    [0xE01D, 105,  62],
		Delete:          [0xE053, 119, 117],
		ArrowUp:         [0xE048, 111, 126],
		ArrowDown:       [0xE050, 116, 125],
		ArrowLeft:       [0xE04B, 113, 123],
		ArrowRight:      [0xE04D, 114, 124],
		End:             [0xE04F, 115, 119],
		Escape:          [0x0001,   9,  53],
		F1:              [0x003B,  67, 122],
		F2:              [0x003C,  68, 120],
		F3:              [0x003D,  69,  99],
		F4:              [0x003E,  70, 118],
		F5:              [0x003F,  71,  96],
		F6:              [0x0040,  72,  97],
		F7:              [0x0041,  73,  98],
		F8:              [0x0042,  74, 100],
		F9:              [0x0043,  75, 101],
		F10:             [0x0044,  76, 109],
		F11:             [0x0057,  95, 103],
		F12:             [0x0058,  96, 111],
		F13:             [0x0064, 191, 105],
		F14:             [0x0065, 192, 107],
		F15:             [0x0066, 193, 113],
		F16:             [0x0067, 194, 106],
		F17:             [0x0068, 195,  64],
		F18:             [0x0069, 196,  79],
		F19:             [0x006A, 197,  80],
		F20:             [0x006B, 198,  90],
		F21:             [0x006C, 199,  -1],
		F22:             [0x006D, 200,  -1],
		F23:             [0x006E, 201,  -1],
		F24:             [0x0076, 202,  -1],
		Home:            [0xE047, 110, 115],
		MetaLeft:        [0xE05B, 133,  55],
		PageDown:        [0xE051, 117, 121],
		PageUp:          [0xE049, 112, 116],
		Enter:           [0x001C,  36,  36],
		ShiftLeft:       [0x002A,  50,  56],
		ShiftRight:      [0x0036,  62,  60],
		Space:           [0x0039,  65,  49],
		Tab:             [0x000F,  23,  48],
		PrintScreen:     [0xE037, 107,  -1],
		ScrollLock:      [0x0046,  78,  -1],
		NumLock:         [0x0045,  77,  71],
		Backquote:       [0x0029,  49,  50],
		Digit1:          [0x0002,  10,  18],
		Digit2:          [0x0003,  11,  19],
		Digit3:          [0x0004,  12,  20],
		Digit4:          [0x0005,  13,  21],
		Digit5:          [0x0006,  14,  23],
		Digit6:          [0x0007,  15,  22],
		Digit7:          [0x0008,  16,  26],
		Digit8:          [0x0009,  17,  28],
		Digit9:          [0x000A,  18,  25],
		Digit0:          [0x000B,  19,  29],
		Minus:           [0x000C,  20,  27],
		Equal:           [0x000D,  21,  24],
		KeyQ:            [0x0010,  24,  12],
		KeyW:            [0x0011,  25,  13],
		KeyE:            [0x0012,  26,  14],
		KeyR:            [0x0013,  27,  15],
		KeyT:            [0x0014,  28,  17],
		KeyY:            [0x0015,  29,  16],
		KeyU:            [0x0016,  30,  32],
		KeyI:            [0x0017,  31,  34],
		KeyO:            [0x0018,  32,  31],
		KeyP:            [0x0019,  33,  35],
		BracketLeft:     [0x001A,  34,  33],
		BracketRight:    [0x001B,  35,  30],
		Backslash:       [0x002B,  51,  42],
		KeyA:            [0x001E,  38,   0],
		KeyS:            [0x001F,  39,   1],
		KeyD:            [0x0020,  40,   2],
		KeyF:            [0x0021,  41,   3],
		KeyG:            [0x0022,  42,   5],
		KeyH:            [0x0023,  43,   4],
		KeyJ:            [0x0024,  44,  38],
		KeyK:            [0x0025,  45,  40],
		KeyL:            [0x0026,  46,  37],
		Semicolon:       [0x0027,  47,  41],
		Quote:           [0x0028,  48,  39],
		IntlBackslash:   [0x0056,  94,  10],
		IntlRo:          [0x0073,  97,  94],
		IntlYen:         [0x007D, 132,  93],
		KanaMode:        [0x0070, 101,  -1],
		KeyZ:            [0x002C,  52,   6],
		KeyX:            [0x002D,  53,   7],
		KeyC:            [0x002E,  54,   8],
		KeyV:            [0x002F,  55,   9],
		KeyB:            [0x0030,  56,  11],
		KeyN:            [0x0031,  57,  45],
		KeyM:            [0x0032,  58,  46],
		Comma:           [0x0033,  59,  43],
		Period:          [0x0034,  60,  47],
		Slash:           [0x0035,  61,  44],
		Insert:          [0xE052, 118, 114],
		NumpadSubtract:  [0x004A,  82,  78],
		NumpadAdd:       [0x004E,  86,  69],
		NumpadMultiply:  [0x0037,  63,  67],
		NumpadDivide:    [0xE035, 106,  75],
		NumpadDecimal:   [0x0053,  91,  65],
		NumpadEnter:     [0xE01C, 104,  76],
		NumpadEqual:     [0x0059, 125,  81],
		NumpadComma:     [0x007E, 129,  95],
		Numpad0:         [0x0052,  90,  82],
		Numpad1:         [0x004F,  87,  83],
		Numpad2:         [0x0050,  88,  84],
		Numpad3:         [0x0051,  89,  85],
		Numpad4:         [0x004B,  83,  86],
		Numpad5:         [0x004C,  84,  87],
		Numpad6:         [0x004D,  85,  88],
		Numpad7:         [0x0047,  79,  89],
		Numpad8:         [0x0048,  80,  91],
		Numpad9:         [0x0049,  81,  92],
		MetaRight:       [0xE05C, 134,  54],
		ContextMenu:     [0xE05D, 135, 110],
		AudioVolumeUp:   [0xE030, 123,  72],
		AudioVolumeDown: [0xE02E, 122,  73],
		AudioVolumeMute: [0xE020, 121,  74],
		NonConvert:      [0x007B, 102,  -1],
		Convert:         [0x0079, 100,  -1],
		Lang1:           [0x00F2, 130, 104],
		Lang2:           [0x00F1, 131, 102]
	};

	constructor(args) {
		super();

		this.args = args ?? Object.create(null);

		Window.AddCssDependencies("rustdesk.css");

		const isRestored = this.args.autoconnect === false;
		delete this.args.autoconnect;
		if (isRestored || this.args.password === null) delete this.args.password; //a remembered password, as with SSH

		this.password = this.args.password ?? null;

		this.socket = null;
		this.connectionId = 0;
		this.connected = false;  //logged in
		this.failed = false;     //the gateway gave a reason, the close that follows says nothing more
		this.encrypted = null;
		this.closeReason = null;
		this.loginDialog = null;
		this.loginDialogTimeout = null;

		this.peerInfo = null;
		this.displays = [];
		this.display = null;

		this.decoder = null;
		this.decoderCodec = null;
		this.keyFrameRequired = true;
		this.lastKeyFrameRequest = 0;
		this.videoTimestamp = 0;
		this.hasFrame = false;

		this.cursorCache = new Map();
		this.pressedKeys = new Map(); //by code, the key events that went down, released when the canvas loses the focus
		this.pendingMove = null;
		this.moveFrame = null;
		this.wheelDelta = { x:0, y:0 };
		this.noticeTimeout = null;

		this.scaleToFit    = true;
		this.viewOnly      = false;
		this.clipboardSync = false;
		this._lastClipboard = null;

		this.SetTitle("RustDesk");
		this.SetIcon("mono/rustdesk.svg");

		this.SetupToolbar();

		if (!this.args.isRecording) {
			this.connectButton   = this.AddToolbarButton("Connect", "mono/connect.svg?light");
			this.viewOnlyButton  = this.AddToolbarButton("View only", "mono/lock.svg?light");
			this.AddToolbarSeparator();
			this.cadButton       = this.AddToolbarButton("Send ctrl+alt+del", "mono/cad.svg?light");
			this.metaButton      = this.AddToolbarButton("Send meta", "mono/winkey.svg?light");
			this.sendTextButton  = this.AddToolbarButton("Send key-strokes", "mono/keyboard.svg?light");
			this.clipboardButton = this.AddToolbarButton("Clipboard sync", "mono/clipboard.svg?light");
			this.AddToolbarSeparator();
			this.refreshButton   = this.AddToolbarButton("Refresh screen", "mono/update.svg?light");
			this.displayDropDown = this.AddToolbarDropdown("mono/monitor.svg?light");
			this.displayDropDown.button.setAttribute("aria-label", "Display");
			this.displayDropDown.button.style.display = "none"; //until the host has more than one
		}

		this.fitButton        = this.AddToolbarButton("Fit to window", "mono/fittoscreen.svg?light");
		this.fullScreenButton = this.AddToolbarButton("Full screen", "mono/fullscreen.svg?light");
		this.screenshotButton = this.AddToolbarButton("Save screenshot", "mono/download.svg?light");

		this.canvasBox = document.createElement("div");
		this.canvasBox.className = "rustdesk-canvas-box";
		this.content.appendChild(this.canvasBox);

		this.canvas = document.createElement("canvas");
		this.canvas.className = "rustdesk-canvas";
		this.canvas.width = 0;
		this.canvas.height = 0;
		this.canvas.tabIndex = 0;
		this.canvasBox.appendChild(this.canvas);
		this.context2d = this.canvas.getContext("2d", { alpha:false });

		this.statusBox = document.createElement("div");
		this.statusBox.className = "rustdesk-status-box";
		this.statusBox.textContent = "Connecting...";

		this.fitButton.onclick        = ()=> this.ToggleScaling();
		this.fullScreenButton.onclick = ()=> this.canvasBox.requestFullscreen();
		this.screenshotButton.onclick = ()=> this.SaveScreenshot();

		this.fitButton.style.borderBottom = "3px solid rgb(192,192,192)";

		this.resizeObserver = new ResizeObserver(()=> this.UpdateScale());
		this.resizeObserver.observe(this.canvasBox);

		if (this.args.isRecording) return;

		this.connectButton.onclick   = ()=> this.ConnectDialog(this.args.host);
		this.viewOnlyButton.onclick  = ()=> this.ToggleViewOnly();
		this.cadButton.onclick       = ()=> this.SendCtrlAltDel();
		this.metaButton.onclick      = ()=> this.SendMeta();
		this.sendTextButton.onclick  = ()=> this.SendTextDialog();
		this.clipboardButton.onclick = ()=> this.ToggleClipboardSync();
		this.refreshButton.onclick   = ()=> this.RefreshScreen();

		this.SetupInput();

		this._clipboardSyncHandler = ()=> this.SyncClipboardToRemote();
		window.addEventListener("focus", this._clipboardSyncHandler);
		document.addEventListener("visibilitychange", this._clipboardSyncHandler);

		if (this.args.host && !isRestored) {
			this.SetTitle(`RustDesk - ${this.args.host}`);
			this.Connect();
		}
		else {
			this.ConnectDialog(this.args.host ?? "", true);
		}
	}

	static async LoadZstd() {
		if (RustDesk.zstd) return RustDesk.zstd;

		RustDesk.zstdPromise ??= import("./fzstd/fzstd.js").then(
			module=> RustDesk.zstd = module,
			ex=> {
				RustDesk.zstdPromise = null; //allow a retry on next attempt
				throw new Error(`Failed to load the zstd decoder from ./fzstd/ (${ex.message})`);
			}
		);

		return RustDesk.zstdPromise;
	}

	//What this browser decodes, the host picks among these. WebCodecs exists only in a secure context.
	static async DetectCodecs() {
		if (RustDesk.codecs) return RustDesk.codecs;

		const codecs = Object.create(null);
		if (typeof VideoDecoder === "undefined") return codecs;

		for (const { name, codec } of Object.values(RustDesk.VIDEO_CODECS)) {
			try {
				const support = await VideoDecoder.isConfigSupported({ codec:codec, optimizeForLatency:true });
				codecs[name] = Boolean(support.supported);
			}
			catch {
				codecs[name] = false;
			}
		}

		return RustDesk.codecs = codecs;
	}

	async Connect() {
		const host = this.args.host;
		if (!host) return;

		const port = this.args.port || RustDesk.DEFAULT_PORT;
		const connectionId = ++this.connectionId;

		this.Disconnect();
		this.connectButton.disabled = true;
		this.ShowStatus("mono/connect.svg", "Connecting...");

		let codecs;
		try {
			await RustDesk.LoadZstd();
			codecs = await RustDesk.DetectCodecs();
		}
		catch (ex) {
			if (connectionId !== this.connectionId) return;
			this.ShowStatus("mono/error.svg", "Failed to load the RustDesk client");
			this.connectButton.disabled = false;
			this.ConfirmBox(ex.message, true, "mono/error.svg");
			return;
		}

		if (connectionId !== this.connectionId) return;

		if (!codecs.vp9) {
			this.ShowStatus("mono/error.svg", window.isSecureContext ? "This browser can't decode VP9 video" : "Decoding the video needs a secure (HTTPS) connection");
			this.connectButton.disabled = false;
			return;
		}

		const query = new URLSearchParams({ target: host.includes(":") ? `[${host}]:${port}` : `${host}:${port}` });
		if (this.args.file) query.set("file", this.args.file);
		if (this.args.credential) query.set("credential", this.args.credential);

		let socket;
		try {
			socket = new WebSocket(`${KEEP.isSecure ? "wss" : "ws"}://${window.location.host}/ws/rustdesk?${query}`);
		}
		catch (ex) {
			this.ShowStatus("mono/error.svg", ex.message);
			this.connectButton.disabled = false;
			return;
		}

		socket.binaryType = "arraybuffer";
		this.socket = socket;
		this.failed = false;
		this.encrypted = null;
		this.closeReason = null;

		//vault credentials are resolved and logged in with by the server, a typed password goes along with the codecs
		socket.onopen = ()=> {
			const hello = {
				codecs   : Object.keys(codecs).filter(o=> codecs[o]),
				clipboard: this.clipboardSync
			};
			if (this.password && !this.args.credential) hello.password = this.password;
			socket.send(JSON.stringify(hello));
		};

		socket.onmessage = event=> {
			if (this.socket !== socket) return;
			if (typeof event.data === "string") {
				this.HandleControl(event.data);
			}
			else {
				this.HandleMessage(new Uint8Array(event.data));
			}
		};

		socket.onclose = event=> {
			if (this.socket !== socket) return;
			this.OnClosed(event.reason);
		};
	}

	Disconnect() {
		const socket = this.socket;
		this.socket = null;
		if (socket) {
			try { socket.close(); } catch {}
		}

		this.EndSession();
	}

	//what a session holds goes with it, the last frame stays on the canvas
	EndSession() {
		this.ReleaseKeys();
		this.CloseDecoder();
		this.CloseLoginDialog();

		this.connected = false;
		this.peerInfo = null;
		this.displays = [];
		this.display = null;
		this.hasFrame = false;
		this.cursorCache.clear();
		this.canvas.style.cursor = "";
		this.UpdateDisplayMenu();
	}

	OnClosed(reason) {
		const wasConnected = this.connected;

		this.socket = null;
		this.EndSession();
		this.connectButton.disabled = false;

		if (this.failed) return; //the reason is on screen already

		const text = this.closeReason || reason || (wasConnected ? "Connection closed" : "Connection lost");
		this.ShowStatus(wasConnected ? "mono/disconnect.svg" : "mono/error.svg", text);
	}

	//the gateway's login messages: the connection's state, its prompts, or why it failed
	HandleControl(json) {
		let message;
		try {
			message = JSON.parse(json);
		}
		catch {
			return;
		}

		if (message.error && !message.login) { //a prompt's error is the reason it asks again
			this.failed = true;
			this.CloseLoginDialog();
			this.ShowStatus("mono/error.svg", message.error);
			this.connectButton.disabled = false;
			return;
		}

		if ("encrypted" in message) {
			this.encrypted = message.encrypted === true;
			this.ShowStatus("mono/connect.svg", "Logging in...");
			return;
		}

		switch (message.login) {
		case "password":
			this.ShowStatus("mono/lock.svg", message.error ?? "Waiting for a password, or for the remote user to accept...");
			this.PasswordDialog(message.error, message.vault === true);
			break;

		case "waiting": //the host takes no password, only the remote user's accept
			this.CloseLoginDialog();
			this.ShowStatus("mono/clock.svg", "Waiting for the remote user to accept the connection...");
			break;

		case "2fa":
			this.ShowStatus("mono/key.svg", message.error ?? "Two-factor authentication required");
			this.TwoFactorDialog(message.error);
			break;
		}
	}

	SendLoginAnswer(object) {
		if (this.socket?.readyState === WebSocket.OPEN) {
			this.socket.send(JSON.stringify(object));
		}
	}

	HandleMessage(bytes) {
		const P = RustDeskProto;

		let message;
		try {
			message = P.Read(bytes);
		}
		catch {
			return;
		}

		const field = Number(Object.keys(message).at(-1));
		const value = P.Get(message, field, null);

		try {
			switch (field) {
			case RustDesk.MSG_LOGIN_RESPONSE  : this.OnLoginResponse(value); break;
			case RustDesk.MSG_PEER_INFO       : this.OnPeerInfo(value); break;
			case RustDesk.MSG_VIDEO_FRAME     : this.OnVideoFrame(value); break;
			case RustDesk.MSG_CURSOR_DATA     : this.OnCursorData(value); break;
			case RustDesk.MSG_CURSOR_ID       : this.SetCursor(String(value)); break;
			case RustDesk.MSG_CLIPBOARD       : this.OnClipboard(value); break;
			case RustDesk.MSG_MULTI_CLIPBOARDS: this.OnMultiClipboards(value); break;
			case RustDesk.MSG_MISC            : this.OnMisc(value); break;
			case RustDesk.MSG_MESSAGE_BOX     : this.OnMessageBox(value); break;
			case RustDesk.MSG_TEST_DELAY      : this.OnTestDelay(value, bytes); break;
			}
		}
		catch (ex) {
			console.warn(`RustDesk: ${ex.message}`);
		}
	}

	OnLoginResponse(bytes) {
		if (!(bytes instanceof Uint8Array)) return;

		const response = RustDeskProto.Read(bytes);
		const peerInfo = RustDeskProto.Get(response, 2, null);
		if (!peerInfo) return; //the gateway answers the login errors itself

		this.connected = true;
		this.CloseLoginDialog();
		this.OnPeerInfo(peerInfo);

		this.ShowStatus("mono/connect.svg", "Waiting for the screen...");

		if (this.args.isRecording) return;

		this.SetTitle(`RustDesk - ${this.args.host}`);
		this.connectButton.disabled = true;
		this.ShowToast("This session is being recorded");
		this.canvas.focus();
	}

	OnPeerInfo(bytes) {
		const P = RustDeskProto;
		const info = P.Read(bytes);

		this.peerInfo = {
			username: P.String(P.Get(info, 1, null)),
			hostname: P.String(P.Get(info, 2, null)),
			platform: P.String(P.Get(info, 3, null)),
			version : P.String(P.Get(info, 7, null))
		};

		this.displays = (info[4] ?? []).map((display, index)=> RustDesk.ReadDisplay(display, index));

		const current = P.Int32(P.Get(info, 5));
		this.SetDisplay(this.displays[current] ?? this.displays[0] ?? null);
		this.UpdateDisplayMenu();
	}

	static ReadDisplay(bytes, index) {
		const P = RustDeskProto;
		const display = P.Read(bytes);
		return {
			index : index,
			x     : P.Sint32(P.Get(display, 1)),
			y     : P.Sint32(P.Get(display, 2)),
			width : P.Int32(P.Get(display, 3)),
			height: P.Int32(P.Get(display, 4)),
			name  : P.String(P.Get(display, 5, null))
		};
	}

	SetDisplay(display) {
		this.display = display;
		if (!display) return;

		//until the first frame the canvas takes the display's size, a frame then gives its own
		if (!this.hasFrame && display.width > 0 && display.height > 0) {
			this.canvas.width = display.width;
			this.canvas.height = display.height;
			this.UpdateScale();
		}

		this.UpdateDisplayMenu();
	}

	UpdateDisplayMenu() {
		const dropdown = this.displayDropDown;
		if (!dropdown) return;

		dropdown.list.textContent = "";
		dropdown.button.style.display = this.displays.length > 1 ? "" : "none";
		if (this.displays.length < 2) return;

		dropdown.menu.style.height = `${this.displays.length * 32 + 4}px`;

		for (const display of this.displays) {
			const option = document.createElement("div");
			option.style.paddingLeft = "8px"; //no icons
			option.textContent = `${display.index + 1}. ${display.name || "Display"} (${display.width} x ${display.height})`;
			option.style.backgroundColor = display.index === this.display?.index ? "var(--clr-select)" : "";
			option.onclick = ()=> {
				dropdown.button.blur(); //closes the menu
				this.SwitchDisplay(display.index);
			};
			dropdown.list.append(option);
		}
	}

	SwitchDisplay(index) {
		if (!this.connected || index === this.display?.index) return;
		this.Send(RustDesk.MiscMessage(new RustDeskProto().Message(5, new RustDeskProto().Varint(1, index))));
	}

	OnSwitchDisplay(bytes) {
		const P = RustDeskProto;
		const message = P.Read(bytes);
		const index = P.Int32(P.Get(message, 1));

		const display = {
			index : index,
			x     : P.Sint32(P.Get(message, 2)),
			y     : P.Sint32(P.Get(message, 3)),
			width : P.Int32(P.Get(message, 4)),
			height: P.Int32(P.Get(message, 5)),
			name  : this.displays[index]?.name ?? ""
		};

		this.displays[index] = display;
		this.SetDisplay(display); //the next frame sizes the canvas
	}

	OnMisc(bytes) {
		const P = RustDeskProto;
		const misc = P.Read(bytes);

		if (misc[5]) this.OnSwitchDisplay(P.Get(misc, 5)); //switch_display
		if (misc[9]) this.closeReason = P.String(P.Get(misc, 9)); //close_reason
	}

	OnMessageBox(bytes) {
		const P = RustDeskProto;
		const box = P.Read(bytes);
		const type = P.String(P.Get(box, 1, null));
		const text = P.String(P.Get(box, 3, null)) || P.String(P.Get(box, 2, null));
		if (!text) return;

		if (type.includes("error")) {
			this.ShowStatus("mono/error.svg", text);
		}
		else {
			this.ShowNotice("mono/info.svg", text);
		}
	}

	//the host measures the round trip, a probe of its own comes back as it is
	OnTestDelay(value, bytes) {
		const delay = RustDeskProto.Read(value);
		if (!RustDeskProto.Get(delay, 2)) this.Send(bytes); //from_client
	}

	OnVideoFrame(bytes) {
		const P = RustDeskProto;
		const frame = P.Read(bytes);
		const display = P.Int32(P.Get(frame, 14));

		let codec = null, frames = null;
		for (const field in RustDesk.VIDEO_CODECS) {
			if (frame[field]) {
				codec = RustDesk.VIDEO_CODECS[field];
				frames = P.Read(P.Get(frame, field));
			}
		}

		//raw frames and other displays are not shown, the host still waits for them to be taken
		if (!codec || this.display && display !== this.display.index) {
			this.AckVideo();
			return;
		}

		let queued = 0;
		for (const chunk of frames[1] ?? []) {
			const encoded = P.Read(chunk);
			const data = P.Get(encoded, 1, null);
			const key = Boolean(P.Get(encoded, 2));
			if (!data) continue;

			if (!this.EnsureDecoder(codec)) break;
			if (this.keyFrameRequired && !key) continue;

			try {
				this.decoder.decode(new EncodedVideoChunk({ type:key ? "key" : "delta", timestamp:this.videoTimestamp++, data:data }));
				this.keyFrameRequired = false;
				queued++;
			}
			catch {
				this.CloseDecoder();
				break;
			}
		}

		//every frame the decoder outputs is acknowledged, a message that brings none, or lost its decoder, is acknowledged here
		if (queued === 0 || !this.decoder) {
			this.AckVideo();
			if (this.keyFrameRequired) this.RequestKeyFrame();
		}
	}

	EnsureDecoder(codec) {
		if (this.decoder?.state === "configured" && this.decoderCodec === codec.codec) return true;

		this.CloseDecoder();

		const decoder = new VideoDecoder({
			output: frame=> this.OnVideoOutput(decoder, frame),
			error : ()=> {
				if (this.decoder !== decoder) return;
				this.decoder = null;
				this.keyFrameRequired = true;
				this.AckVideo();
				this.RequestKeyFrame();
			}
		});

		try {
			decoder.configure({ codec:codec.codec, optimizeForLatency:true });
		}
		catch {
			return false;
		}

		this.decoder = decoder;
		this.decoderCodec = codec.codec;
		this.keyFrameRequired = true;
		return true;
	}

	CloseDecoder() {
		if (this.decoder) {
			try { this.decoder.close(); } catch {}
		}
		this.decoder = null;
		this.decoderCodec = null;
		this.keyFrameRequired = true;
	}

	OnVideoOutput(decoder, frame) {
		if (this.decoder !== decoder) {
			frame.close();
			return;
		}

		this.AckVideo();

		const width = frame.displayWidth, height = frame.displayHeight;
		if (this.canvas.width !== width || this.canvas.height !== height) {
			this.canvas.width = width;
			this.canvas.height = height;
			this.UpdateScale();
		}

		this.context2d.drawImage(frame, 0, 0);
		frame.close();

		if (!this.hasFrame) {
			this.hasFrame = true;
			this.HideStatus();
			if (this.encrypted === false && !this.args.isRecording) {
				this.ShowNotice("mono/warning.svg", "The connection to the host is not encrypted");
			}
		}
	}

	//the host waits for each frame to be taken before it sends the next, which keeps the browser from falling behind
	AckVideo() {
		this.Send(RustDesk.MiscMessage(new RustDeskProto().Bool(12, true))); //video_received
	}

	RequestKeyFrame() {
		const now = Date.now();
		if (now - this.lastKeyFrameRequest < 1000) return;
		this.lastKeyFrameRequest = now;
		this.Send(RustDesk.MiscMessage(new RustDeskProto().Bool(10, true))); //refresh_video
	}

	RefreshScreen() {
		this.lastKeyFrameRequest = 0;
		this.RequestKeyFrame();
	}

	OnCursorData(bytes) {
		const P = RustDeskProto;
		const cursor = P.Read(bytes);

		const id     = String(P.Get(cursor, 1));
		const x      = P.Sint32(P.Get(cursor, 2));
		const y      = P.Sint32(P.Get(cursor, 3));
		const width  = P.Int32(P.Get(cursor, 4));
		const height = P.Int32(P.Get(cursor, 5));

		let style = "default";
		if (width > 0 && height > 0 && width <= 512 && height <= 512 && RustDesk.zstd) {
			try {
				const rgba = RustDesk.zstd.decompress(P.Get(cursor, 6, new Uint8Array(0)), new Uint8Array(width * height * 4));
				style = RustDesk.CursorStyle(rgba, width, height, x, y);
			}
			catch {}
		}

		if (this.cursorCache.size >= 256) {
			this.cursorCache.delete(this.cursorCache.keys().next().value);
		}
		this.cursorCache.set(id, style);
		this.SetCursor(id);
	}

	SetCursor(id) {
		this.canvas.style.cursor = this.cursorCache.get(id) ?? "default";
	}

	//The cursor's RGBA bitmap as a CSS cursor, scaled down to at most MAX_CURSOR_SIZE pixels.
	static CursorStyle(rgba, width, height, hotX, hotY) {
		const source = document.createElement("canvas");
		source.width = width;
		source.height = height;
		source.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, width * height * 4), width, height), 0, 0);

		const scale = Math.min(1, RustDesk.MAX_CURSOR_SIZE / Math.max(width, height));
		let image = source;

		if (scale < 1) {
			image = document.createElement("canvas");
			image.width = Math.max(1, Math.round(width * scale));
			image.height = Math.max(1, Math.round(height * scale));

			const context = image.getContext("2d");
			context.imageSmoothingQuality = "high";
			context.drawImage(source, 0, 0, image.width, image.height);
		}

		const x = Math.max(0, Math.min(Math.round(hotX * scale), image.width - 1));
		const y = Math.max(0, Math.min(Math.round(hotY * scale), image.height - 1));

		return `url(${image.toDataURL("image/png")}) ${x} ${y}, default`;
	}

	OnClipboard(bytes) {
		if (!this.clipboardSync || this.args.isRecording) return;

		const text = RustDesk.ClipboardText(RustDeskProto.Read(bytes));
		if (text === null || text.length === 0) return;

		this._lastClipboard = text;
		navigator.clipboard?.writeText(text).catch(()=> {});
	}

	OnMultiClipboards(bytes) {
		const clipboards = RustDeskProto.Read(bytes)[1] ?? [];
		const text = clipboards.find(o=> RustDeskProto.Int32(RustDeskProto.Get(RustDeskProto.Read(o), 5)) === 0); //ClipboardFormat.Text
		if (text) this.OnClipboard(text);
	}

	//null unless the clipboard holds text, which the host compresses past a few bytes
	static ClipboardText(clipboard) {
		const P = RustDeskProto;
		if (P.Int32(P.Get(clipboard, 5)) !== 0) return null; //ClipboardFormat.Text

		let content = P.Get(clipboard, 2, new Uint8Array(0));

		if (P.Get(clipboard, 1)) { //compress
			const length = RustDesk.ZstdContentSize(content);
			if (length < 0 || length > RustDesk.MAX_CLIPBOARD_LENGTH || !RustDesk.zstd) return null;
			try {
				content = RustDesk.zstd.decompress(content, new Uint8Array(length));
			}
			catch {
				return null;
			}
		}

		return P.String(content);
	}

	//The content size a zstd frame header declares, -1 when it declares none. The size bounds what the clipboard may take.
	static ZstdContentSize(data) {
		if (data.length < 6 || data[0] !== 0x28 || data[1] !== 0xb5 || data[2] !== 0x2f || data[3] !== 0xfd) return -1;

		const descriptor = data[4];
		const singleSegment = descriptor >> 5 & 1;
		const offset = 5 + (singleSegment ? 0 : 1) + [0, 1, 2, 4][descriptor & 3];
		const size = [singleSegment ? 1 : 0, 2, 4, 8][descriptor >> 6];
		if (size === 0 || data.length < offset + size) return -1;

		let value = 0;
		for (let i = size - 1; i >= 0; i--) {
			value = value * 256 + data[offset + i];
		}

		return size === 2 ? value + 256 : value;
	}

	SetupInput() {
		const canvas = this.canvas;

		canvas.addEventListener("contextmenu", event=> event.preventDefault());

		canvas.addEventListener("pointerdown", event=> {
			canvas.focus();
			if (!this.CanInput()) return;
			event.preventDefault();
			canvas.setPointerCapture(event.pointerId);
			this.SendPointerButton(event, RustDesk.MOUSE_TYPE_DOWN);
		});

		canvas.addEventListener("pointerup", event=> {
			if (!this.CanInput()) return;
			event.preventDefault();
			this.SendPointerButton(event, RustDesk.MOUSE_TYPE_UP);
		});

		canvas.addEventListener("pointermove", event=> this.QueuePointerMove(event));

		canvas.addEventListener("wheel", event=> {
			if (!this.CanInput()) return;
			event.preventDefault();
			this.SendWheel(event);
		}, { passive:false });

		//the session takes every key while it has the focus, the escape key and the menu's double alt included
		canvas.addEventListener("keydown", event=> this.OnKey(event, true));
		canvas.addEventListener("keyup", event=> this.OnKey(event, false));
		canvas.addEventListener("blur", ()=> this.ReleaseKeys());
	}

	CanInput() {
		return this.connected && !this.viewOnly && !this.args.isRecording;
	}

	//the point on the host's desktop, the display's offset included
	RemotePoint(event) {
		const display = this.display;
		const rect = this.canvas.getBoundingClientRect();
		if (!display || rect.width === 0 || rect.height === 0) return null;

		const x = Math.floor((event.clientX - rect.left) * display.width / rect.width);
		const y = Math.floor((event.clientY - rect.top) * display.height / rect.height);

		return {
			x: display.x + Math.max(0, Math.min(display.width - 1, x)),
			y: display.y + Math.max(0, Math.min(display.height - 1, y))
		};
	}

	static Modifiers(event) {
		const modifiers = [];
		if (event.ctrlKey)  modifiers.push(RustDesk.CONTROL_KEY_CONTROL);
		if (event.shiftKey) modifiers.push(RustDesk.CONTROL_KEY_SHIFT);
		if (event.altKey)   modifiers.push(RustDesk.CONTROL_KEY_ALT);
		if (event.metaKey)  modifiers.push(RustDesk.CONTROL_KEY_META);
		return modifiers;
	}

	SendMouse(mask, x, y, modifiers) {
		this.Send(new RustDeskProto().Message(RustDesk.MSG_MOUSE_EVENT, new RustDeskProto()
			.Varint(1, mask)
			.Sint32(2, x)
			.Sint32(3, y)
			.Enums(4, modifiers)
		).ToArray());
	}

	//moves go out once a frame, the latest one
	QueuePointerMove(event) {
		if (!this.CanInput()) return;

		const point = this.RemotePoint(event);
		if (!point) return;

		this.pendingMove = { point:point, modifiers:RustDesk.Modifiers(event) };
		if (this.moveFrame !== null) return;

		this.moveFrame = requestAnimationFrame(()=> {
			this.moveFrame = null;
			this.FlushPointerMove();
		});
	}

	FlushPointerMove() {
		if (this.moveFrame !== null) {
			cancelAnimationFrame(this.moveFrame);
			this.moveFrame = null;
		}

		const move = this.pendingMove;
		this.pendingMove = null;
		if (!move) return;

		this.SendMouse(RustDesk.MOUSE_TYPE_MOVE, move.point.x, move.point.y, move.modifiers);
	}

	//the host presses at the pointer's position, so it is moved there first
	SendPointerButton(event, type) {
		const button = RustDesk.MOUSE_BUTTONS[event.button];
		const point = this.RemotePoint(event);
		if (!button || !point) return;

		this.pendingMove = null;
		this.FlushPointerMove();

		const modifiers = RustDesk.Modifiers(event);
		this.SendMouse(RustDesk.MOUSE_TYPE_MOVE, point.x, point.y, modifiers);
		this.SendMouse(button << 3 | type, point.x, point.y, modifiers);
	}

	//The host scrolls by notches. A wheel's event is a notch or a few, a touchpad's small ones add up to one.
	SendWheel(event) {
		const scale = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 800 : 1;
		const notch = (value, axis)=> {
			if (event.deltaMode !== 0 || Math.abs(value) >= 50) {
				this.wheelDelta[axis] = 0;
				return Math.sign(value) * Math.min(10, Math.max(1, Math.round(Math.abs(value) / 100)));
			}

			this.wheelDelta[axis] += value;
			if (Math.abs(this.wheelDelta[axis]) < 100) return 0;

			const sign = Math.sign(this.wheelDelta[axis]);
			this.wheelDelta[axis] -= sign * 100;
			return sign;
		};

		const x = notch(event.deltaX * scale, "x");
		const y = notch(event.deltaY * scale, "y");
		if (x === 0 && y === 0) return;

		//down and right are negative to the host
		const point = this.RemotePoint(event);
		this.FlushPointerMove();
		if (point) this.SendMouse(RustDesk.MOUSE_TYPE_MOVE, point.x, point.y, []);
		this.SendMouse(RustDesk.MOUSE_TYPE_WHEEL, -x, -y, RustDesk.Modifiers(event));
	}

	//0 Windows, 1 Linux, 2 macOS, the host's key codes in map mode, -1 for a host whose codes aren't known
	PlatformIndex() {
		switch (this.peerInfo?.platform) {
		case "Windows": return 0;
		case "Linux"  : return 1;
		case "Mac OS" : return 2;
		default       : return -1;
		}
	}

	OnKey(event, down) {
		if (!this.CanInput()) return;

		event.preventDefault();
		event.stopPropagation();

		if (down) {
			this.pressedKeys.set(event.code, event);
		}
		else {
			this.pressedKeys.delete(event.code);
		}

		const message = this.KeyMessage(event, down);
		if (message) this.Send(message);
	}

	//Map mode sends the physical key in the host's own key codes, the host's layout makes the character. A host of
	//another platform gets the legacy mode, named keys as control keys and characters as code points.
	KeyMessage(event, down) {
		const platform = this.PlatformIndex();
		const code = platform < 0 ? undefined : RustDesk.KEY_CODES[event.code]?.[platform];
		const modifiers = RustDesk.Modifiers(event);

		if (code !== undefined && (platform === 2 ? code >= 0 : code > 0)) {
			return RustDesk.KeyEvent(new RustDeskProto()
				.Bool(1, down)
				.OneofVarint(4, code)
				.Enums(8, modifiers)
				.Varint(9, RustDesk.KEYBOARD_MODE_MAP));
		}

		const controlKey = RustDesk.LEGACY_KEYS[event.key];
		if (controlKey) {
			return RustDesk.KeyEvent(new RustDeskProto()
				.Bool(1, down)
				.OneofVarint(3, controlKey)
				.Enums(8, modifiers)
				.Varint(9, RustDesk.KEYBOARD_MODE_LEGACY));
		}

		if ([...event.key].length === 1) {
			return RustDesk.KeyEvent(new RustDeskProto()
				.Bool(1, down)
				.OneofVarint(4, event.key.codePointAt(0))
				.Enums(8, modifiers)
				.Varint(9, RustDesk.KEYBOARD_MODE_LEGACY));
		}

		return null;
	}

	//what's held down goes up when the focus leaves, or the host would keep it pressed
	ReleaseKeys() {
		if (this.pressedKeys.size === 0) return;

		const pressed = [...this.pressedKeys.values()];
		this.pressedKeys.clear();

		if (!this.connected) return;
		for (const event of pressed) {
			const message = this.KeyMessage(event, false);
			if (message) this.Send(message);
		}
	}

	static KeyEvent(keyEvent) {
		return new RustDeskProto().Message(RustDesk.MSG_KEY_EVENT, keyEvent).ToArray();
	}

	static MiscMessage(misc) {
		return new RustDeskProto().Message(RustDesk.MSG_MISC, misc).ToArray();
	}

	//a press is the key going down and up on the host
	PressControlKey(controlKey, modifiers=[]) {
		this.Send(RustDesk.KeyEvent(new RustDeskProto()
			.Bool(2, true)
			.OneofVarint(3, controlKey)
			.Enums(8, modifiers)
			.Varint(9, RustDesk.KEYBOARD_MODE_LEGACY)));
	}

	//a Windows host takes ctrl+alt+del as the secure attention sequence, once, so it goes down alone;
	//another host gets delete with ctrl and alt
	SendCtrlAltDel() {
		if (!this.CanInput()) return;

		if (this.PlatformIndex() === 0) {
			this.Send(RustDesk.KeyEvent(new RustDeskProto()
				.Bool(1, true)
				.OneofVarint(3, RustDesk.CONTROL_KEY_CTRL_ALT_DEL)
				.Varint(9, RustDesk.KEYBOARD_MODE_LEGACY)));
		}
		else {
			this.PressControlKey(RustDesk.CONTROL_KEY_DELETE, [RustDesk.CONTROL_KEY_CONTROL, RustDesk.CONTROL_KEY_ALT]);
		}
	}

	SendMeta() {
		if (!this.CanInput()) return;
		this.PressControlKey(RustDesk.CONTROL_KEY_META);
	}

	//the host types a sequence as it is, a line break is a press of the return key
	SendKeystrokes(text) {
		if (!this.CanInput() || !text) return;

		const lines = text.split(/\r\n|\r|\n/);
		for (let i = 0; i < lines.length; i++) {
			if (i > 0) this.PressControlKey(RustDesk.CONTROL_KEY_RETURN);

			if (lines[i].length > 0) {
				this.Send(RustDesk.KeyEvent(new RustDeskProto()
					.Bool(2, true)
					.String(6, lines[i])
					.Varint(9, RustDesk.KEYBOARD_MODE_LEGACY)));
			}
		}
	}

	Send(bytes) {
		if (this.args.isRecording || !this.connected) return;
		if (this.socket?.readyState !== WebSocket.OPEN) return;
		this.socket.send(bytes);
	}

	ShowStatus(icon, text) {
		clearTimeout(this.noticeTimeout);
		this.noticeTimeout = null;

		this.statusBox.style.display = "initial";
		this.statusBox.style.backgroundImage = `url(${icon})`;
		this.statusBox.textContent = text;
		this.content.appendChild(this.statusBox);
	}

	//a status that goes away on its own
	ShowNotice(icon, text) {
		this.ShowStatus(icon, text);
		this.noticeTimeout = setTimeout(()=> this.HideStatus(), 5000);
	}

	HideStatus() {
		clearTimeout(this.noticeTimeout);
		this.noticeTimeout = null;
		this.statusBox.style.display = "none";
	}

	UpdateScale() {
		const width = this.canvas.width, height = this.canvas.height;
		if (!width || !height) return;

		if (this.scaleToFit) {
			const scale = Math.min(this.canvasBox.clientWidth / width, this.canvasBox.clientHeight / height);
			if (!(scale > 0)) return;
			this.canvas.style.width = `${Math.floor(width * scale)}px`;
			this.canvas.style.height = `${Math.floor(height * scale)}px`;
		}
		else {
			this.canvas.style.width = `${width}px`;
			this.canvas.style.height = `${height}px`;
		}

		this.canvasBox.classList.toggle("rustdesk-scroll", !this.scaleToFit);
	}

	ToggleScaling() {
		this.scaleToFit = !this.scaleToFit;
		this.fitButton.style.borderBottom = this.scaleToFit ? "3px solid rgb(192,192,192)" : "none";
		this.UpdateScale();
	}

	ToggleViewOnly() {
		this.viewOnly = !this.viewOnly;

		if (this.viewOnly) this.ReleaseKeys();

		this.cadButton.disabled = this.viewOnly;
		this.metaButton.disabled = this.viewOnly;
		this.sendTextButton.disabled = this.viewOnly;

		this.viewOnlyButton.style.borderBottom = this.viewOnly ? "3px solid rgb(192,192,192)" : "none";
	}

	//the host shares its clipboard only while the sync is on
	ToggleClipboardSync() {
		this.clipboardSync = !this.clipboardSync;
		this.clipboardButton.style.borderBottom = this.clipboardSync ? "3px solid rgb(192,192,192)" : "none";

		this.Send(RustDesk.MiscMessage(new RustDeskProto().Message(7, new RustDeskProto()
			.Varint(8, this.clipboardSync ? 1 : 2)))); //option, disable_clipboard: no or yes

		if (this.clipboardSync) this.SyncClipboardToRemote();
	}

	async SyncClipboardToRemote() {
		if (!this.CanInput()) return;
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
			this.Send(new RustDeskProto().Message(RustDesk.MSG_CLIPBOARD, new RustDeskProto()
				.String(2, text)).ToArray()); //uncompressed text
		}
	}

	ConnectDialog(target="", isNew=false) {
		const dialog = this.DialogBox("240px");
		if (dialog === null) return;

		const {okButton, cancelButton, innerBox, buttonBox} = dialog;
		okButton.value = "Connect";

		const dialogBox = innerBox.parentElement;
		dialogBox.style.maxWidth = "440px";
		dialogBox.parentElement.onclick = event=> event.stopPropagation();

		innerBox.style.display = "grid";
		innerBox.style.gridTemplateColumns = "100px minmax(50px, 250px)";
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
		portInput.value = this.args.port || RustDesk.DEFAULT_PORT;
		innerBox.append(portLabel, portInput);

		const passwordLabel = document.createElement("div");
		passwordLabel.style.gridArea = "5 / 1";
		passwordLabel.textContent = "Password:";
		const passwordInput = document.createElement("input");
		passwordInput.style.gridArea = "5 / 2";
		passwordInput.type = "password";
		passwordInput.placeholder = "or let the remote user accept";
		innerBox.append(passwordLabel, passwordInput);

		const rememberPasswordToggle = this.CreateToggle("Remember password", false, innerBox);
		rememberPasswordToggle.label.style.gridArea = "6 / 2 / 6 / 4";
		rememberPasswordToggle.label.style.whiteSpace = "nowrap";
		rememberPasswordToggle.label.style.overflow = "hidden";
		rememberPasswordToggle.label.style.textOverflow = "ellipsis";

		if ("password" in this.args) {
			rememberPasswordToggle.checkbox.checked = true;
			passwordInput.value = this.args.password ?? "";
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

			innerBox.style.gridTemplateRows = manual ? "36px 8px repeat(4, 36px)" : "36px 8px repeat(3, 36px)";
			dialogBox.style.maxHeight = manual ? "280px" : "240px";

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
			UpdateOkState();
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
			this.args.port = parseInt(portInput.value) || RustDesk.DEFAULT_PORT;

			if (methodBox.index === 0) {
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
				delete this.args.password;
				this.password = null;
				this.args.credential = credentialsInput.value;
			}

			dialog.Close();
			this.SetTitle(`RustDesk - ${this.args.host}`);
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

		hostInput.onchange = hostInput.oninput = UpdateOkState;

		credentialsInput.onchange = UpdateOkState;

		UpdateSelection();
		setTimeout(()=> methodBox.container.focus(), 200);
	}

	//a dialog that is still closing holds the window a moment longer, the prompt waits for it
	DeferLoginDialog(open, attempt) {
		if (attempt >= 20) return;

		clearTimeout(this.loginDialogTimeout);
		this.loginDialogTimeout = setTimeout(()=> {
			if (!this.socket || this.connected) return;
			open(attempt + 1);
		}, WIN.ANIME_DURATION + 50);
	}

	CloseLoginDialog() {
		clearTimeout(this.loginDialogTimeout);
		this.loginDialogTimeout = null;

		if (this.loginDialog) {
			const dialog = this.loginDialog;
			this.loginDialog = null;
			dialog.Close();
		}
	}

	//The host asks for a password while the remote user may still accept, closing the dialog keeps waiting for that.
	PasswordDialog(error, vault, attempt=0) {
		this.CloseLoginDialog();

		const dialog = this.DialogBox("180px");
		if (dialog === null) {
			this.DeferLoginDialog(next=> this.PasswordDialog(error, vault, next), attempt);
			return;
		}
		this.loginDialog = dialog;

		const {okButton, cancelButton, innerBox} = dialog;
		okButton.value = "Log in";

		innerBox.style.padding = "20px";
		innerBox.parentElement.style.maxWidth = "400px";
		innerBox.parentElement.parentElement.onclick = event=> event.stopPropagation();

		const message = document.createElement("div");
		message.textContent = error
			? `Authentication failed${vault ? " with the vault credentials" : ""}: ${error}. Please try again.`
			: "Enter the RustDesk password, or wait for the remote user to accept.";
		message.style.paddingBottom = "16px";
		message.style.fontWeight = "600";

		const passwordLabel = document.createElement("div");
		passwordLabel.style.display = "inline-block";
		passwordLabel.style.minWidth = "88px";
		passwordLabel.textContent = "Password:";
		const passwordInput = document.createElement("input");
		passwordInput.type = "password";
		passwordInput.style.width = "calc(100% - 120px)";
		passwordInput.value = (this.args.credential || error) ? "" : this.password ?? "";
		innerBox.append(message, passwordLabel, passwordInput);

		passwordInput.onkeydown = event=> {
			if (event.key === "Enter") okButton.click();
		};

		okButton.onclick = ()=> {
			this.password = passwordInput.value.length > 0 ? passwordInput.value : null;
			delete this.args.credential;

			//a remembered password follows the one typed here
			if ("password" in this.args) {
				if (this.password !== null) this.args.password = this.password;
				else delete this.args.password;
			}

			this.CloseLoginDialog();
			this.SendLoginAnswer({ password: passwordInput.value });
			this.ShowStatus("mono/connect.svg", "Logging in...");
		};

		cancelButton.onclick = ()=> {
			this.loginDialog = null;
			dialog.Close();
			if (this.socket) this.ShowStatus("mono/clock.svg", "Waiting for the remote user to accept the connection...");
		};

		setTimeout(()=> {
			passwordInput.focus();
			passwordInput.select();
		}, 200);
	}

	TwoFactorDialog(error, attempt=0) {
		this.CloseLoginDialog();

		const dialog = this.DialogBox("180px");
		if (dialog === null) {
			this.DeferLoginDialog(next=> this.TwoFactorDialog(error, next), attempt);
			return;
		}
		this.loginDialog = dialog;

		const {okButton, cancelButton, innerBox} = dialog;
		okButton.value = "Verify";

		innerBox.style.padding = "20px";
		innerBox.parentElement.style.maxWidth = "400px";
		innerBox.parentElement.parentElement.onclick = event=> event.stopPropagation();

		const message = document.createElement("div");
		message.textContent = error ? `${error}. Please try again.` : "Enter the code of the host's authenticator app.";
		message.style.paddingBottom = "16px";
		message.style.fontWeight = "600";

		const codeLabel = document.createElement("div");
		codeLabel.style.display = "inline-block";
		codeLabel.style.minWidth = "88px";
		codeLabel.textContent = "Code:";
		const codeInput = document.createElement("input");
		codeInput.type = "text";
		codeInput.inputMode = "numeric";
		codeInput.autocomplete = "one-time-code";
		codeInput.style.width = "calc(100% - 120px)";
		innerBox.append(message, codeLabel, codeInput);

		codeInput.onkeydown = event=> {
			if (event.key === "Enter") okButton.click();
		};

		okButton.onclick = ()=> {
			this.CloseLoginDialog();
			this.SendLoginAnswer({ code: codeInput.value.trim() });
			this.ShowStatus("mono/connect.svg", "Logging in...");
		};

		cancelButton.onclick = ()=> {
			this.loginDialog = null;
			dialog.Close();
			this.Disconnect();
			this.connectButton.disabled = false;
			this.ShowStatus("mono/disconnect.svg", "Connection closed");
		};

		setTimeout(()=> codeInput.focus(), 200);
	}

	SendTextDialog() {
		if (!this.connected) return;

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

	SaveScreenshot() {
		if (!this.hasFrame) return;

		this.canvas.toBlob(blob=> {
			if (!blob) return;

			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;

			const host = this.meta?.host ?? this.args.host ?? "rustdesk";
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

		this.resizeObserver.disconnect();
		clearTimeout(this.noticeTimeout);
		if (this.moveFrame !== null) cancelAnimationFrame(this.moveFrame);

		this.Disconnect();

		super.Close();
	}
}

class RustDeskRecording extends RustDesk {
	static SPEED_STEPS = [.5, 1, 2, 4, 8, 16];

	constructor(args) {
		super({ ...(args ?? {}), isRecording: true });

		Window.AddCssDependencies("recordingplayback.css");

		this.canvasBox.style.bottom = "72px";

		this.meta = null;
		this.durationMs = 0;
		this.currentMs = 0;
		this.playing = true;
		this.speed = 1;
		this.ended = false;

		this.controlSocket = null;

		this.SetTitle("RustDesk recording");
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
			const response = await fetch(`/recordings/meta?protocol=rustdesk&id=${encodeURIComponent(this.args.recordingId)}`);
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

		this.SetTitle(`RustDesk recording - ${meta.host} (${new Date(meta.start).toLocaleString()})`);

		let codecs;
		try {
			await RustDesk.LoadZstd();
			codecs = await RustDesk.DetectCodecs();
		}
		catch (ex) {
			this.ShowStatus("mono/error.svg", ex.message);
			return;
		}

		if (!codecs.vp9) {
			this.ShowStatus("mono/error.svg", window.isSecureContext ? "This browser can't decode VP9 video" : "Decoding the video needs a secure (HTTPS) connection");
			return;
		}

		this.ConnectPlayback(0);
	}

	//The recording is replayed from its start, up to startMs as fast as it goes, as the video's frames build on each other.
	ConnectPlayback(startMs) {
		this.TeardownPlayback();

		this.currentMs = startMs;
		this.ended = false;

		this.ShowStatus("mono/connect.svg", "Loading recording...");

		const wsUrl = `${KEEP.isSecure ? "wss" : "ws"}://${window.location.host}/ws/recordingplayback?protocol=rustdesk&id=${encodeURIComponent(this.args.recordingId)}&t=${Math.round(startMs)}`;
		const controlSocket = new WebSocket(wsUrl);
		controlSocket.binaryType = "arraybuffer";
		this.controlSocket = controlSocket;

		controlSocket.onopen = ()=> {
			if (!this.playing) {
				controlSocket.send(JSON.stringify({ cmd: "pause" }));
			}
		};

		controlSocket.onmessage = event=> {
			if (this.controlSocket !== controlSocket || typeof event.data === "string") return;
			this.HandleMessage(new Uint8Array(event.data));
		};

		controlSocket.onclose = ()=> {
			if (this.controlSocket !== controlSocket) return;

			this.playing = false;
			this.ended = true;
			this.playPauseButton.style.backgroundImage = "url(mono/play.svg)";

			this.currentMs = this.durationMs;
			this.UpdateClockDisplay();
		};
	}

	TeardownPlayback() {
		if (this.controlSocket) {
			try { this.controlSocket.close(); } catch {}
			this.controlSocket = null;
		}

		this.EndSession();
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
		const steps = RustDeskRecording.SPEED_STEPS;
		const index = steps.indexOf(this.speed);
		const nextIndex = Math.min(steps.length - 1, Math.max(0, index + direction));
		if (nextIndex === index) return;

		this.speed = steps[nextIndex];
		this.SendControl({ cmd: "speed", x: this.speed });
		this.UpdateSpeedDisplay();
	}

	UpdateSpeedDisplay() {
		const steps = RustDeskRecording.SPEED_STEPS;
		this.speedLabel.textContent = this.speed === 1 ? "" : `${this.speed}x`;
		this.rewindButton.disabled = this.speed <= steps[0];
		this.fastForwardButton.disabled = this.speed >= steps[steps.length - 1];
	}

	UpdateClockDisplay() {
		if (!this.durationMs) return;

		if (this.playing) {
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
