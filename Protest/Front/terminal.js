class Terminal extends Window {
	static CHAR_WIDTH = 8;
	static CHAR_HEIGHT = 18;

	static SPECIAL_KEYS = {
		"Enter"      : "\r",
		"NumpadEnter": "\r",
		"Tab"        : "\t",
		"Backspace"  : "\x08",
		"ArrowUp"    : "\x1b[A",
		"ArrowDown"  : "\x1b[B",
		"ArrowRight" : "\x1b[C",
		"ArrowLeft"  : "\x1b[D",
		"Home"       : "\x1b[H",
		"End"        : "\x1b[F",
		"F1"  : "\x1b[OP",
		"F2"  : "\x1b[OQ",
		"F3"  : "\x1b[OR",
		"F4"  : "\x1b[OS",
		"F5"  : "\x1b[15~",
		"F6"  : "\x1b[17~",
		"F7"  : "\x1b[18~",
		"F8"  : "\x1b[19~",
		"F9"  : "\x1b[20~",
		"F10" : "\x1b[21~",
		"F11" : "\x1b[23~",
		"F12" : "\x1b[24~",
		"Insert"   : "\x1b[2~",
		"Delete"   : "\x1b[3~",
		"PageUp"   : "\x1b[5~",
		"PageDown" : "\x1b[6~"
	};

	static SHIFT_KEYS = {
		"F1" : "\x1B[1;2P",
		"F2" : "\x1B[1;2Q",
		"F3" : "\x1B[1;2R",
		"F4" : "\x1B[1;2S",
		"F5" : "\x1B[15;2~",
		"F6" : "\x1B[17;2~",
		"F7" : "\x1B[18;2~",
		"F8" : "\x1B[19;2~",
		"F9" : "\x1B[20;2~",
		"F10": "\x1B[21;2~",
		"F11": "\x1B[23;2~",
		"F12": "\x1B[24;2~",
		"ArrowUp"   : "\x1B[1;2A",
		"ArrowDown" : "\x1B[1;2B",
		"ArrowRight": "\x1B[1;2C",
		"ArrowLeft" : "\x1B[1;2D",
		"Home"      : "\x1B[1;2H",
		"End"       : "\x1B[1;2F",
		"Insert"    : "\x1B[2;2~",
		"Delete"    : "\x1B[3;2~",
		"PageUp"    : "\x1B[5;2~",
		"PageDown"  : "\x1B[6;2~",
	};

	static CTRL_KEYS = {
		"KeyA": "\x01",
		"KeyB": "\x02",
		"KeyC": "\x03",
		"KeyD": "\x04",
		"KeyE": "\x05",
		"KeyF": "\x06",
		"KeyG": "\x07",
		"KeyH": "\x08",
		"KeyI": "\x09",
		"KeyJ": "\x0A",
		"KeyK": "\x0B",
		"KeyL": "\x0C",
		"KeyM": "\x0D",
		"KeyN": "\x0E",
		"KeyO": "\x0F",
		"KeyP": "\x10",
		"KeyQ": "\x11",
		"KeyR": "\x12",
		"KeyS": "\x13",
		"KeyT": "\x14",
		"KeyU": "\x15",
		"KeyV": "\x16",
		"KeyW": "\x17",
		"KeyX": "\x18",
		"KeyY": "\x19",
		"KeyZ": "\x1A",
		"F1" :"\x1B[1;5P",
		"F2" :"\x1B[1;5Q",
		"F3" :"\x1B[1;5R",
		"F4" :"\x1B[1;5S",
		"F5" :"\x1B[15;5~",
		"F6" :"\x1B[17;5~",
		"F7" :"\x1B[18;5~",
		"F8" :"\x1B[19;5~",
		"F9" :"\x1B[20;5~",
		"F10":"\x1B[21;5~",
		"F11":"\x1B[23;5~",
		"F12":"\x1B[24;5~",
		"Backspace": "\x7F",
		"ArrowUp"   : "\x1B[1;5A",
		"ArrowDown" : "\x1B[1;5B",
		"ArrowRight": "\x1B[1;5C",
		"ArrowLeft" : "\x1B[1;5D",
		"Home"      : "\x1B[1;5H",
		"End"       : "\x1B[1;5F",
		"Insert"    : "\x1B[2;5~",
		"Delete"    : "\x1B[3;5~",
		"PageUp"    : "\x1B[5;5~",
		"PageDown"  : "\x1B[6;5~",
	};

	static ALT_KEYS = {
		"F1" : "\x1B[1;3P",
		"F2" : "\x1B[1;3Q",
		"F3" : "\x1B[1;3R",
		"F4" : "\x1B[1;3S",
		"F5" : "\x1B[15;3~",
		"F6" : "\x1B[17;3~",
		"F7" : "\x1B[18;3~",
		"F8" : "\x1B[19;3~",
		"F9" : "\x1B[20;3~",
		"F10": "\x1B[21;3~",
		"F11": "\x1B[23;3~",
		"F12": "\x1B[24;3~",
		"ArrowUp"    : "\x1B[1;3A",
		"ArrowDown"  : "\x1B[1;3B",
		"ArrowRight" : "\x1B[1;3C",
		"ArrowLeft"  : "\x1B[1;3D",
	};

	constructor(args) {
		super();

		this.args = Object.assign({
			host: "",
			ansi: true,
			autoScroll: true,
			bell: false,
			smoothCursor: false
		}, args);

		this.AddCssDependencies("terminal.css");
		
		this.InitializeComponents();
		this.InitializeTerminalState();
		this.ResetTextAttributes();

		this.ws = null;
	}

	InitializeTerminalState() {
		this.cursor = {x:0, y:0};
		this.screen = {};

		this.scrollRegionTop = null;
		this.scrollRegionBottom = null;

		this.savedCursorPos        = null;
		this.savedLine             = null; //TODO:
		this.savedScreen           = null;
		this.savedTitle            = null;

		this.lineWrappingMode      = false; //TODO:
		this.insertMode            = false; //TODO:
		this.localEchoMode         = false; //TODO:
		this.keypadApplicationMode = false; //TODO:
		this.bracketedMode         = false;
	}

	InitializeComponents() {
		this.SetupToolbar();
		this.connectButton = this.AddToolbarButton("Connect", "mono/connect.svg?light");
		this.optionsButton = this.AddToolbarButton("Options", "mono/wrench.svg?light");
		this.AddToolbarSeparator();
		this.sendKeyButton = this.AddToolbarButton("Send key", "mono/keyboard.svg?light");
		this.pasteButton = this.AddToolbarButton("Paste", "mono/clipboard.svg?light");
		//this.saveText = this.AddToolbarButton("Save text", "mono/floppy.svg?light");

		this.defaultElement = this.content;

		this.content.tabIndex = 1;
		this.content.classList.add("terminal-content");

		this.cursorElement = document.createElement("div");
		this.cursorElement.className = "terminal-cursor";
		this.cursorElement.style.transition = this.args.smoothCursor ? ".1s" : "0s";

		this.statusBox = document.createElement("div");
		this.statusBox.className = "terminal-status-box";
		this.statusBox.textContent = "Connecting...";

		this.win.onclick = ()=> this.content.focus();
		this.content.onfocus = ()=> this.BringToFront();
		this.content.onkeydown = event=> this.Terminal_onkeydown(event);

		this.connectButton.onclick = ()=> this.ConnectDialog(this.args.host);
		this.optionsButton.onclick = ()=> this.OptionsDialog();
		this.sendKeyButton.onclick = ()=> this.CustomKeyDialog();
		this.pasteButton.onclick   = ()=> this.TextFromClipboard();
	}

	ResetTextAttributes() {
		this.foreColor     = null;
		this.backColor     = null;
		this.bold          = false;
		this.faint         = false;
		this.italic        = false;
		this.underline     = false;
		this.blinking      = false;
		this.fastBlinking  = false;
		this.inverse       = false;
		this.hidden        = false;
		this.strikethrough = false;
	}

	Close() { //overrides
		if (this.ws != null) this.ws.close();
		super.Close();
	}

	ConnectDialog(target="", isNew=false) {} //overridable

	OptionsDialog() {
		const dialog = this.DialogBox("240px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		innerBox.style.padding = "20px";
		innerBox.parentElement.style.maxWidth = "480px";
		innerBox.parentElement.parentElement.onclick = event=> { event.stopPropagation(); };

		const ansiToggle = this.CreateToggle("Escape ANSI codes", this.args.ansi, innerBox);
		innerBox.appendChild(document.createElement("br"));
		innerBox.appendChild(document.createElement("br"));

		const autoScrollToggle = this.CreateToggle("Auto-scroll", this.args.autoScroll, innerBox);
		innerBox.appendChild(document.createElement("br"));
		innerBox.appendChild(document.createElement("br"));

		const bellToggle = this.CreateToggle("Play bell sound", this.args.bell, innerBox);
		innerBox.appendChild(document.createElement("br"));
		innerBox.appendChild(document.createElement("br"));

		const smoothCursorToggle = this.CreateToggle("Smooth cursor", this.args.smoothCursor, innerBox);

		okButton.onclick = ()=> {
			this.args.ansi         = ansiToggle.checkbox.checked;
			this.args.bell         = bellToggle.checkbox.checked;
			this.args.autoScroll   = autoScrollToggle.checkbox.checked;
			this.args.smoothCursor = smoothCursorToggle.checkbox.checked;
			dialog.Close();

			this.cursorElement.style.transition = this.args.smoothCursor ? ".1s" : "0s";
		};

		setTimeout(()=>ansiToggle.label.focus(), 200);
	}

	CustomKeyDialog() {
		const dialog = this.DialogBox("180px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		okButton.value = "Send";

		innerBox.style.padding = "20px";
		innerBox.parentElement.style.maxWidth = "400px";
		innerBox.parentElement.parentElement.onclick = event=> { event.stopPropagation(); };

		const keyLabel = document.createElement("div");
		keyLabel.style.display = "inline-block";
		keyLabel.style.minWidth = "50px";
		keyLabel.textContent = "Key:";
		innerBox.appendChild(keyLabel);

		const keyInput = document.createElement("select");
		keyInput.style.width = "150px";
		innerBox.appendChild(keyInput);

		innerBox.appendChild(document.createElement("br"));
		innerBox.appendChild(document.createElement("br"));

		const shift = this.CreateToggle("Shift", false, innerBox);
		const ctrl  = this.CreateToggle("Ctrl", false, innerBox);
		const alt   = this.CreateToggle("Alt", false, innerBox);

		shift.label.style.margin = "4px 1px";
		ctrl.label.style.margin = "4px 1px";
		alt.label.style.margin = "4px 1px";

		const ListKeys = ()=> {
			let set;
			if (shift.checkbox.checked) {
				set = Terminal.SHIFT_KEYS;
			}
			else if (ctrl.checkbox.checked) {
				set = Terminal.CTRL_KEYS;
			}
			else if (alt.checkbox.checked) {
				set = Terminal.ALT_KEYS;
			}
			else {
				set = Terminal.SPECIAL_KEYS;
			}

			keyInput.textContent = "";

			for (let key in set) {
				const option = document.createElement("option");
				option.value = set[key];
				option.textContent = key;
				keyInput.appendChild(option);
			}
		};

		shift.checkbox.onchange = ()=> {
			if (shift.checkbox.checked) {
				ctrl.checkbox.checked = false;
				alt.checkbox.checked = false;
			}
			ListKeys();
		};

		ctrl.checkbox.onchange = ()=> {
			if (ctrl.checkbox.checked) {
				shift.checkbox.checked = false;
				alt.checkbox.checked = false;
			}
			ListKeys();
		};
		
		alt.checkbox.onchange = ()=> {
			if (alt.checkbox.checked) {
				shift.checkbox.checked = false;
				ctrl.checkbox.checked = false;
			}
			ListKeys();
		};

		keyInput.onkeydown = event=> {
			if (event.key === "Enter" && !okButton.disabled) {
				dialog.okButton.click();
			}
		};

		okButton.onclick = ()=> {
			dialog.Close();
			if (this.ws && this.ws.readyState === 1) {
				this.ws.send(keyInput.value);
			}
		};

		ListKeys();
		setTimeout(()=>keyInput.focus(), 200);
	}

	async TextFromClipboard() {
		let text = null;
		try {
			text = await navigator.clipboard.readText();
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
			return;
		}

		if (text === null || text.length === 0) return;
		if (this.ws === null || this.ws.readyState != 1) return;

		if (this.bracketedMode) {
			this.ws.send(`\x1b[200~${text}\x1b[201~`);
		}
		else {
			this.ws.send(text);
		}
	}

	Terminal_onkeydown(event) {
		if (event.ctrlKey && event.shiftKey) return;
		if (!this.ws || this.ws.readyState !== 1) return;
		
		event.preventDefault();

		//TODO: if (this.keypadApplicationMode) {}

		if (event.shift && Terminal.SHIFT_KEYS[event.code]) {
			this.ws.send(Terminal.SHIFT_KEYS[event.code]);
		}
		else if (event.ctrlKey && Terminal.CTRL_KEYS[event.code]) {
			this.ws.send(Terminal.CTRL_KEYS[event.code]);
		}
		else if (event.altKey && Terminal.ALT_KEYS[event.code]) {
			this.ws.send(Terminal.ALT_KEYS[event.code]);
		}
		else if (event.key.length === 1) {
			this.ws.send(event.key);
		}
		else {
			const key = Terminal.SPECIAL_KEYS[event.code];
			if (key) this.ws.send(key);
		}
	}

	HandleMessage(data) {
		for (let i=0; i<data.length; i++) {
			let char = this.screen[`${this.cursor.x},${this.cursor.y}`];
			let isNew = false;

			if (!char) {
				isNew = true;
				char = document.createElement("span");
				char.style.left = `${this.cursor.x * Terminal.CHAR_WIDTH}px`;
				char.style.top = `${this.cursor.y * Terminal.CHAR_HEIGHT}px`;
				this.content.appendChild(char);
				this.screen[`${this.cursor.x},${this.cursor.y}`] = char;
			}

			switch (data[i]) {
			case "\x07":
				if (this.args.bell) this.Bell();
				this.cursorElement.style.animation = "terminal-shake .4s 1";
				setTimeout(()=>{ this.cursorElement.style.animation = "terminal-blinking 1.2s infinite"; }, 400);
				break;

			case "\x08": //backspace or move left
				this.cursor.x = Math.max(0, this.cursor.x - 1);
				break;

			//case "\x09": break; //tab

			case "\n": //lf 0x0a
				char.innerHTML = "<br>";
				this.cursor.x = 0;
				this.cursor.y++;
				break;

			//case "\x0b": break; //vertical tab
			//case "\x0c": break; //new page.

			case "\r": //cr 0x0d
				if (i+2 < data.length && data[i+1]==="\r" && data[i+2]==="\n") {
					char.innerHTML = "<br>";
					this.cursor.x = 0;
					this.cursor.y++;
					i+=2;
					break;
				}
				else if (i+1 < data.length && data[i+1]==="\n") {
					char.innerHTML = "<br>";
					this.cursor.x = 0;
					this.cursor.y++;
					i++;
					break;
				}
				else {
					this.cursor.x = 0;
				}
				break;

			case "\x1b": //esc
				if (this.args.ansi) {
					i += this.HandleEscSequence(data, i) - 1;
				}
				else {
					char.textContent = data[i];
				}
				break;

			//case "\x7f": break; //delete

			default:
				if (!isNew) {
					if (char.style.color)           char.style.color           = "unset";
					if (char.style.backgroundColor) char.style.backgroundColor = "unset";
					if (char.style.fontWeight)      char.style.fontWeight      = "normal";
					if (char.style.fontStyle)       char.style.fontStyle       = "none";
					if (char.style.opacity)         char.style.opacity         = "1";
					if (char.style.textDecoration)  char.style.textDecoration  = "none";
					if (char.style.animation)       char.style.animation       = "none";
					if (char.style.visibility)      char.style.visibility      = "visible";
				}

				if (data[i] === " ") {
					char.innerHTML = "&nbsp;";
				}
				else {
					char.textContent = data[i];
				}

				let foreColor, backColor;
				if (this.inverse) {
					foreColor = this.backColor ?? "rgb(32,32,32)";
					backColor = this.foreColor ?? "rgb(224,224,224)";
				}
				else {
					foreColor = this.foreColor;
					backColor = this.backColor;
				}

				if (foreColor) char.style.color = foreColor;
				if (backColor) char.style.backgroundColor = backColor;

				if (this.bold)          char.style.fontWeight = "bold";
				if (this.faint)         char.style.opacity = "0.6";
				if (this.italic)        char.style.fontStyle = "italic";
				if (this.underline)     char.style.textDecoration = "underline";
				if (this.strikethrough) char.style.textDecoration = "line-through";
				if (this.blinking)      char.style.animation = "terminal-blinking 1s infinite";
				if (this.fastBlinking)  char.style.animation = "terminal-fast-blinking .2s infinite";
				if (this.hidden)        char.style.visibility = "hidden";

				this.cursor.x++;
				break;
			}

			this.lastCharacter = data[i];
		}

		this.cursorElement.style.left = Terminal.CHAR_WIDTH * this.cursor.x + "px";
		this.cursorElement.style.top = Terminal.CHAR_HEIGHT * this.cursor.y + "px";

		if (this.scrollRegionTop && this.cursor.y < this.scrollRegionTop) {
			this.ScrollUp();
		}
		else if (this.scrollRegionBottom && this.cursor.y >= this.scrollRegionBottom-1) {
			this.ScrollDown();
		}

		if (this.args.autoScroll) {
			if (this.args.smoothCursor) {
				setTimeout(()=>this.cursorElement.scrollIntoView(), 200);
			}
			else {
				this.cursorElement.scrollIntoView();
			}
		}
	}

	HandleEscSequence(data, index) {
		if (index + 1 >= data.length) return 1;

		switch (data[index+1]) {
		case "[": return this.HandleCSI(data, index);
		case "P": return this.HandleDCS(data, index);
		case "]": return this.HandleOSC(data, index);
		case "(": return this.HandleCSD(data, index);

		case "=": //application keypad mode
			this.keypadApplicationMode = true;
			return 2;

		case ">": //normal keypad mode
			this.keypadApplicationMode = false;
			return 2;

		case "7": //save cursor position
			this.savedCursorPos = {x:this.cursor.x, y:this.cursor.y};
			return 2;

		case "8": //restore cursor position
			this.cursor.x = this.savedCursorPos.x;
			this.cursor.y = this.savedCursorPos.y;
			return 2;

		default:
			console.warn("Unknown escape sequence: " + data[index+1]);
			return 2;
		}
	}

	HandleCSI(data, index) { //Control Sequence Introducer
		if (index >= data.length) return 2;
		const sequence = data.slice(index + 1);

		const match = sequence.match(/^\[([?=]?)(\d*(;\d*)*)?([A-Za-z])/);
		if (!match) return 2;

		const fullSequence = match[0];
		const prefix       = match[1] || ""; // ?, = or ""
		const paramsString = match[2] || "";
		const command      = match[4];

		const params = paramsString.split(";").map(param => {
			return param === "" ? 0 : parseInt(param, 10);
		});

		switch (command) {
		case "A": //cursor up
			this.cursor.y = Math.max(0, this.cursor.y - (params[0] || 1));
			break;

		case "B": //cursor down
			this.cursor.y += params[0] || 1;
			break;

		case "C": //cursor right
			this.cursor.x += params[0] || 1;
			break;

		case "D": //cursor left
			this.cursor.x = Math.max(0, this.cursor.x - (params[0] || 1));
			break;

		case "E": //cursor to beginning of next line, n lines down
			this.cursor.x = 0;
			this.cursor.y += params[0] || 1;
			break;

		case "F": //cursor to beginning of previous line, n lines up
			this.cursor.x = 0;
			this.cursor.y = Math.max(0, this.cursor.y - (params[0] || 1));
			break;

		case "G": //cursor to column n
			this.cursor.x = Math.max(0, (params[0] || 1) - 1);
			break;

		case "f":
		case "H": //move the cursor to row n, column m
			this.cursor.y = Math.max(0, (params[0] || 1) - 1);
			this.cursor.x = Math.max(0, (params[1] || 1) - 1);
			break;

		case "J":
			switch (params[0]) {
			case 0: this.EraseFromCursorToEndOfScreen(); break;
			case 1: this.EraseFromCursorToBeginningOfScreen(); break;
			case 2: this.ClearScreen(); break;
			case 3: this.ClearScreenAndBuffer(); break;
			default:
				console.log(`Unhandled CSI command: ${params.join(";")}J`);
				break;
			}
			break;

		case "K":
			switch (params[0]) {
			case 0: this.EraseLineFromCursorToEnd(); break;
			case 1: this.EraseLineFromBeginningToCursor(); break;
			case 2: this.ClearLine(); break;
			default:
				console.log(`Unhandled CSI command: ${params.join(";")}K`);
				break;
			}
			break;

		case "P": this.DeleteN(params[0] || 1); break;
		//case "S": break; //not ANSI
		//case "T": break; //not ANSI

		case "d": //move cursor to the specified line
			this.cursor.y = (params[0] || 1) - 1;
			break;

		case "h": //enable mode
			switch (params[0]) {
			case 1   : this.appCursorKeys    = true; break;
			case 4   : this.insertMode       = true; break;
			case 7   : this.lineWrappingMode = true; break;
			case 12  : this.localEchoMode    = true; break;
			case 25  : this.cursorElement.style.visibility = "visible"; break;
			case 1049: this.EnableAlternateScreen(); break;
			case 2004: this.bracketedMode = true; break;
			default  : console.warn(`Unhandled enable mode: ${params.join(";")}h`);
			}
			break;

		case "l": //disable mode
			switch (params[0]) {
			case 1   : this.appCursorKeys     = false; break;
			case 4   : this.insertMode        = false; break;
			case 7   : this.lineWrappingMode  = false; break;
			case 12  : this.localEchoMode     = false; break;
			case 25  : this.cursorElement.style.visibility = "hidden"; break;
			case 1049: this.DisableAlternateScreen(); break;
			case 2004: this.bracketedMode = false; break;
			default  : console.warn(`Unhandled disable mode: ${params.join(";")}l`);
			}
			break;

		case "m": this.ParseGraphicsModes(params); break;

		case "r": //set scroll region
			this.scrollRegionTop = parseInt(params[0]) || 1;
			this.scrollRegionBottom = parseInt(params[1]);
			break;

		case "s": //save cursor position
			this.savedCursorPos = {x:this.cursor.x, y:this.cursor.y};
			break;

		case "t": //window manipulation
			switch (params[0]) {
			case 22: //save window title
				this.savedTitle = this.header.textContent;
				break;

			case 23: //restore window title
				if (this.savedTitle) {
					this.SetTitle(this.savedTitle);
				}
				break;

			default:
				console.warn(`Unhandled window manipulation command: ${params.join(";")}t`);
				break;
			}
			break;

		case "u": //restore cursor position
			this.cursor.x = this.savedCursorPos.x;
			this.cursor.y = this.savedCursorPos.y;
			break;

		default:
			console.warn(`Unhandled CSI command: ${command}`);
			break;
		}

		return fullSequence.length + 1;
	}

	HandleDCS(data, index) { //Device Control String
		if (index >= data.length) return 2;

		console.warn(`Unknown DCS: ${data[index+2]}`);
		return 2;
	}

	HandleOSC(data, index) { //Operating System Command
		if (index >= data.length) return 2;

		const oscEnd = data.indexOf("\x07", index + 2);
		const stEnd = data.indexOf("\x1b\\", index + 2);
		let end = Math.min(oscEnd !== -1 ? oscEnd : data.length, stEnd !== -1 ? stEnd : data.length);

		if (end === data.length) {
			console.warn("Incomplete OSC sequence");
			return 2;
		}

		const sequence = data.slice(index + 2, end);
		const [command, ...params] = sequence.split(";");

		switch (command) {
		case "0":
		case "2": //set title
			this.SetTitle(`Secure shell - ${this.args.host} - ${params.join(";")}`);
			break;

		case "10": //set foreground color
			this.content.style.color = this.MapColorId(params[0]);
			break;

		case "11": //set background color
			this.content.style.backgroundColor = this.MapColorId(params[0]);
			break;

		default:
			console.warn(`Unhandled OSC command: ${command}`);
			break;
		}

		return end - index + 1;
	}

	HandleCSD(data, index) { //Character Set Designation
		if (index >= data.length) return 2;

		const command = data[index + 2];
		switch (command) {
		//TODO:
		//case "B": return 3;//ISO-8859-1
		//case "0": return 3;

		default:
			console.warn(`Unhandled CSD command: ${command}`);
			return 3;
		}
	}

	MapColorId(id) {
		switch (id) {
		case 0: return "#111";    //black
		case 1: return "#de382b"; //red
		case 2: return "#39b54a"; //green
		case 3: return "#e1c706"; //yellow
		case 4: return "#3080D8"; //blue
		case 5: return "#bc3fbc"; //magenta
		case 6: return "#2cb5e9"; //cyan
		case 7: return "#ccc";    //white

		case 8:  return "#888"; //gray
		case 9:  return "#f00"; //bright red
		case 10: return "#0f0"; //bright green
		case 11: return "#ff0"; //bright yellow
		case 12: return "#00f"; //bright blue
		case 13: return "#f0f"; //bright magenta
		case 14: return "#0ff"; //bright cyan
		case 15: return "#fff"; //bright white
		}

		if (id > 231) {
			let hex = (8 + (id - 232) * 10).toString(16).padStart(2, "0");
			return `#${hex.repeat(3)}`;
		}

		let v = id - 16;
		let r = Math.floor(v / 36) * 51;
		let g = Math.floor((v % 36) / 6) * 51;
		let b = (v % 6) * 51;

		return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
	}

	ParseGraphicsModes(params) {
		for (let i=0; i<params.length; i++) {
			switch (params[i]) {
			case 0:
				this.ResetTextAttributes();
				break;

			//set graphics modes
			case 1: this.bold          = true; break;
			case 2: this.faint         = true; break;
			case 3: this.italic        = true; break;
			case 4: this.underline     = true; break;
			case 5: this.blinking      = true; break;
			case 6: this.fastBlinking  = true; break;
			case 7: this.inverse       = true; break;
			case 8: this.hidden        = true; break;
			case 9: this.strikethrough = true; break;

			//reset graphics modes
			case 22: this.bold = this.faint = false; break;
			case 23: this.italic        = false; break;
			case 24: this.underline     = false; break;
			case 25: this.blinking      = false; break;
			case 26: this.fastBlinking  = false; break;
			case 27: this.inverse       = false; break;
			case 28: this.hidden        = false; break;
			case 29: this.strikethrough = false; break;

			//set foreground color
			case 30: case 31: case 32: case 33: case 34: case 35: case 36: case 37:
				this.foreColor = this.MapColorId(params[i] - 30);
				break;

			case 38: //set foreground color
				if (params.length < 3) break;

				if (params[1] === 5) { //id color
					if (params.length < 3) break;
					this.foreColor = this.MapColorId(params[2]);
				}
				else if (params[1] === 2) { //rgb color
					if (params.length < 6) break;
					this.foreColor = `rgb(${params[2]},${params[3]},${params[4]})`;
				}
				else {
					console.warn(`Unknown graphics mode: 38;${params[1]}`);
				}
				break;

			case 39: //reset foreground color
				this.foreColor = null;
				break;

			//set background color
			case 40: case 41: case 42: case 43: case 44: case 45: case 46: case 47:
				this.backColor = this.MapColorId(params[i] - 40);
				break;

			case 48: //set background color
				if (params.length < 3) break;

				if (params[1] === 5) { //id color
					if (params.length < 3) break;
					this.backColor = this.MapColorId(params[2]);
				}
				else if (params[1] === 2) { //rgb color
					if (params.length < 6) break;
					this.backColor = `rgb(${params[2]},${params[3]},${params[4]})`;
				}
				else {
					console.warn(`Unknown graphics mode: 48;${params[1]}`);
				}
				break;

			case 49: //reset foreground color
				this.backColor = null;
				break;

			//reset background color (bright variants)
			case 90: case 91: case 92: case 93: case 94: case 95: case 96: case 97:
				this.foreColor = this.MapColorId(params[i] - 82);
				break;

			//set background color (bright variants)
			case 100: case 101: case 102: case 103: case 104: case 105: case 106: case 107:
				this.backColor = this.MapColorId(params[i] - 92);
				break;

			default:
				console.warn(`Unknown graphics mode: ${params[0]}`);
				break;
			}
		}
	}

	ScrollUp() {
		const top    = this.scrollRegionTop || 0;
		const bottom = this.scrollRegionBottom || this.GetScreenHeight();
		const todo   = {};
		let x, y;

		for (const key in this.screen) {
			[x, y] = key.split(",");
			if (y < top || y >= bottom) continue;
			todo[key] = this.screen[key];
		}

		for (const key in todo) {
			[x, y] = key.split(",");
			delete this.screen[key];
			let y1 = parseInt(y) + 1;
			if (this.scrollRegionBottom && y1 >= this.scrollRegionBottom) continue;
			this.screen[`${x},${y1}`] = todo[key];
			todo[key].style.top = `${y1 * Terminal.CHAR_HEIGHT}px`;
		}
	}

	ScrollDown() {
		const top    = this.scrollRegionTop || 0;
		const bottom = this.scrollRegionBottom || this.GetScreenHeight();
		const todo   = {};
		let x, y;

		for (const key in this.screen) {
			[x, y] = key.split(",");
			if (y < top || y >= bottom) continue;
			todo[key] = this.screen[key];
		}

		for (const key in todo) {
			[x, y] = key.split(",");
			delete this.screen[key];
			let y1 = parseInt(y) - 1;
			if (this.scrollRegionTop && y1 <= this.scrollRegionTop) continue;
			this.screen[`${x},${y1}`] = todo[key];
			todo[key].style.top = `${y1 * Terminal.CHAR_HEIGHT}px`;
		}
	}

	EnableAlternateScreen() { //?1049h
		this.savedScreen = this.screen;
		this.ClearScreen();
		this.savedCursorPos = {x:this.cursor.x, y:this.cursor.y};
	}

	DisableAlternateScreen() { //?1049l
		if (this.savedScreen) {
			this.screen = this.savedScreen;
			this.savedScreen = null;

			this.content.textContent = "";

			for (let o in this.screen) {
				this.content.appendChild(this.screen[o]);
			}

			this.content.appendChild(this.cursorElement);

			if (this.savedCursorPos) {
				this.cursor.x = this.savedCursorPos.x;
				this.cursor.y = this.savedCursorPos.y;
			}
		}
	}

	DeleteN(n) { //P
		let x; //last char in current line
		for (x=this.cursor.x; x<this.GetScreenWidth(); x++) {
			const key = `${x},${this.cursor.y}`;
			if (!this.screen[key]) {
				x--;
				break;
			}
		}

		for (let p=0; p<=n; p++) {
			const key = `${x-p},${this.cursor.y}`;
			if (!this.screen[key]) continue;
			this.content.removeChild(this.screen[key]);
			delete this.screen[key];
		}
	}

	EraseFromCursorToEndOfScreen() { //0J
		if (this.cursor.x === 0 && this.cursor.y === 0) {
			this.ClearScreen();
			return;
		}

		const w = this.GetScreenWidth();
		const h = this.GetScreenHeight();
		const c = w * this.cursor.y + this.cursor.x;

		for (let y=0; y<h; y++) {
			for (let x=0; x<w; x++) {
				if (w*y + x < c) continue;
				const key = `${x},${y}`;
				if (!this.screen[key]) continue;
				this.content.removeChild(this.screen[key]);
				delete this.screen[key];
			}
		}
	}

	EraseFromCursorToBeginningOfScreen() { //1J
		const w = this.GetScreenWidth();
		const h = this.GetScreenHeight();
		const c = w * this.cursor.y + this.cursor.x;

		for (let y=0; y<h; y++) {
			for (let x=0; x<w; x++) {
				if (w*y + x > c) continue;
				const key = `${x},${y}`;
				if (!this.screen[key]) continue;
				this.content.removeChild(this.screen[key]);
				delete this.screen[key];
			}
		}
	}

	ClearScreen() { //2J
		this.screen = {};
		this.content.textContent = "";
		this.content.appendChild(this.cursorElement);
	}

	ClearScreenAndBuffer() { //3J
		this.ClearScreen();
		//TODO: clear scroll-back buffer
	}

	EraseLineFromCursorToEnd() { //0K
		const w = this.GetScreenWidth();
		for (let i=this.cursor.x; i<w; i++) {
			const key = `${i},${this.cursor.y}`;
			if (!this.screen[key]) continue;
			this.content.removeChild(this.screen[key]);
			delete this.screen[key];
		}
	}

	EraseLineFromBeginningToCursor() { //1K
		for (let i=0; i<=this.cursor.x; i++) {
			const key = `${i},${this.cursor.y}`;
			if (!this.screen[key]) continue;
			this.screen[key].textContent = " ";
		}
	}

	ClearLine() { //2K
		const w = this.GetScreenWidth();
		for (let i=0; i<w; i++) {
			const key = `${i},${this.cursor.y}`;
			if (!this.screen[key]) continue;
			this.content.removeChild(this.screen[key]);
			delete this.screen[key];
		}
	}

	GetScreenWidth() {
		return parseInt(this.content.clientWidth / Terminal.CHAR_WIDTH);
	}

	GetScreenHeight() {
		return parseInt(this.content.clientHeight / Terminal.CHAR_HEIGHT);
	}

	Bell() {
		let ctx = new window.AudioContext();
		let oscillator = ctx.createOscillator();
		oscillator.type = "sine";
		oscillator.frequency.value = 360;

		let gain = ctx.createGain();
		gain.gain.value = .4;

		oscillator.connect(gain);
		gain.connect(ctx.destination);

		oscillator.start();
		setTimeout(()=>{ oscillator.stop() }, 150);
	}
}