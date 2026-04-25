class Terminal extends Window {
	static CHAR_WIDTH = 8;
	static CHAR_HEIGHT = 18;
	static DEFAULT_SCROLLBACK = 1500;

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
			smoothCursor: false,
			scrollback: Terminal.DEFAULT_SCROLLBACK
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
		this.pendingSequence = "";

		this.scrollRegionTop = null;
		this.scrollRegionBottom = null;

		this.savedCursorPos = null;
		this.savedLine = null; //TODO:
		this.savedScreen = null;
		this.savedTitle = null;

		this.lineWrappingMode = false; //TODO:
		this.insertMode = false; //TODO:
		this.localEchoMode = false; //TODO:
		this.appCursorKeys = false;
		this.keypadApplicationMode = false; //TODO:
		this.bracketedMode = false;
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
		this.pasteButton.onclick = ()=> this.TextFromClipboard();
	}

	ResetTextAttributes() {
		this.foreColor = null;
		this.backColor = null;
		this.bold = false;
		this.faint = false;
		this.italic = false;
		this.underline = false;
		this.blinking = false;
		this.fastBlinking = false;
		this.inverse = false;
		this.hidden = false;
		this.strikethrough = false;
	}

	CaptureTextAttributes() {
		return {
			foreColor: this.foreColor,
			backColor: this.backColor,
			bold: this.bold,
			faint: this.faint,
			italic: this.italic,
			underline: this.underline,
			blinking: this.blinking,
			fastBlinking: this.fastBlinking,
			inverse: this.inverse,
			hidden: this.hidden,
			strikethrough: this.strikethrough
		};
	}

	RestoreTextAttributes(attributes) {
		if (!attributes) {
			this.ResetTextAttributes();
			return;
		}

		this.foreColor = attributes.foreColor;
		this.backColor = attributes.backColor;
		this.bold = attributes.bold;
		this.faint = attributes.faint;
		this.italic = attributes.italic;
		this.underline = attributes.underline;
		this.blinking = attributes.blinking;
		this.fastBlinking = attributes.fastBlinking;
		this.inverse = attributes.inverse;
		this.hidden = attributes.hidden;
		this.strikethrough = attributes.strikethrough;
	}

	SaveCursorState() {
		this.savedCursorPos = {
			x: this.cursor.x,
			y: this.cursor.y,
			attributes: this.CaptureTextAttributes()
		};
	}

	RestoreCursorState() {
		if (!this.savedCursorPos) return;
		this.cursor.x = this.savedCursorPos.x;
		this.cursor.y = this.savedCursorPos.y;
		this.RestoreTextAttributes(this.savedCursorPos.attributes);
	}

	Close() { //overrides
		if (this.ws != null) this.ws.close();
		super.Close();
	}

	ConnectDialog(target="", isNew=false) {} //overridable

	OptionsDialog() {
		const dialog = this.DialogBox("320px");
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

		innerBox.appendChild(document.createElement("br"));
		innerBox.appendChild(document.createElement("br"));

		const scrollbackLabel = document.createElement("div");
		scrollbackLabel.style.display = "inline-block";
		scrollbackLabel.style.minWidth = "140px";
		scrollbackLabel.textContent = "Scroll-back limit:";
		innerBox.appendChild(scrollbackLabel);

		const scrollbackInput = document.createElement("input");
		scrollbackInput.type = "number";
		scrollbackInput.min = "0";
		scrollbackInput.step = "100";
		scrollbackInput.style.width = "96px";
		scrollbackInput.value = `${this.GetScrollbackLimit()}`;
		innerBox.appendChild(scrollbackInput);

		const scrollbackSuffix = document.createElement("span");
		scrollbackSuffix.textContent = " lines";
		scrollbackSuffix.style.marginLeft = "8px";
		innerBox.appendChild(scrollbackSuffix);

		okButton.onclick = ()=> {
			const scrollback = Number.parseInt(scrollbackInput.value, 10);

			this.args.ansi = ansiToggle.checkbox.checked;
			this.args.bell = bellToggle.checkbox.checked;
			this.args.autoScroll = autoScrollToggle.checkbox.checked;
			this.args.smoothCursor = smoothCursorToggle.checkbox.checked;
			this.args.scrollback = Number.isNaN(scrollback) ? Terminal.DEFAULT_SCROLLBACK : Math.max(0, scrollback);
			dialog.Close();

			this.TrimHistory();
			this.cursorElement.style.transition = this.args.smoothCursor ? ".1s" : "0s";
			this.cursorElement.style.left = Terminal.CHAR_WIDTH * this.cursor.x + "px";
			this.cursorElement.style.top = Terminal.CHAR_HEIGHT * this.cursor.y + "px";
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
		const ctrl = this.CreateToggle("Ctrl", false, innerBox);
		const alt = this.CreateToggle("Alt", false, innerBox);

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

		if (event.shiftKey && Terminal.SHIFT_KEYS[event.code]) {
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
		if (data.length === 0) return;

		if (this.pendingSequence.length > 0) {
			data = this.pendingSequence + data;
			this.pendingSequence = "";
		}

		messageLoop:
		for (let i=0; i<data.length; i++) {
			switch (data[i]) {
			case "\x07":
				if (this.args.bell) this.Bell();
				this.cursorElement.style.animation = "terminal-shake .4s 1";
				setTimeout(()=>{ this.cursorElement.style.animation = "terminal-blinking 1.2s infinite"; }, 400);
				break;

			case "\x08": //backspace or move left
				this.cursor.x = Math.max(0, this.cursor.x - 1);
				break;

			case "\x09": //horizontal tab
				if (this.GetScreenWidth() > 0) {
					this.cursor.x = Math.min(this.GetScreenWidth() - 1, Math.floor(this.cursor.x / 8) * 8 + 8);
				}
				break;

			case "\n": //lf 0x0a
				this.cursor.y++;
				break;

			case "\x0b": //vertical tab
			case "\x0c": //form feed
				this.cursor.y++;
				break;

			case "\r": //cr 0x0d
				if (i+2 < data.length && data[i+1]==="\r" && data[i+2]==="\n") {
					this.cursor.x = 0;
					this.cursor.y++;
					i+=2;
					break;
				}
				else if (i+1 < data.length && data[i+1]==="\n") {
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
					const consumed = this.HandleEscSequence(data, i);
					if (consumed === null) {
						this.pendingSequence = data.slice(i);
						break messageLoop;
					}

					i += consumed - 1;
				}
				else {
					const width = this.GetScreenWidth();
					if (width <= 0) break;
					let char = this.screen[`${this.cursor.x},${this.cursor.y}`];
					if (!char) {
						char = document.createElement("span");
						char.style.left = `${this.cursor.x * Terminal.CHAR_WIDTH}px`;
						char.style.top = `${this.cursor.y * Terminal.CHAR_HEIGHT}px`;
						this.content.appendChild(char);
						this.screen[`${this.cursor.x},${this.cursor.y}`] = char;
					}
					char.textContent = data[i];
					this.cursor.x++;
				}
				break;

			case "\x7f": break; //delete

			default:
				const width = this.GetScreenWidth();
				if (width <= 0) break;

				if (this.cursor.x >= width) {
					if (this.lineWrappingMode) {
						this.cursor.x = 0;
						this.cursor.y++;
					}
					else {
						this.cursor.x = width - 1;
					}
				}

				if (this.insertMode) {
					this.InsertBlankCharacters(1);
				}

				let char = this.screen[`${this.cursor.x},${this.cursor.y}`];
				if (!char) {
					char = document.createElement("span");
					char.style.left = `${this.cursor.x * Terminal.CHAR_WIDTH}px`;
					char.style.top = `${this.cursor.y * Terminal.CHAR_HEIGHT}px`;
					this.content.appendChild(char);
					this.screen[`${this.cursor.x},${this.cursor.y}`] = char;
				}
				else {
					if (char.style.color) char.style.color = "unset";
					if (char.style.backgroundColor) char.style.backgroundColor = "unset";
					if (char.style.fontWeight) char.style.fontWeight = "normal";
					if (char.style.fontStyle) char.style.fontStyle = "normal";
					if (char.style.opacity) char.style.opacity = "1";
					if (char.style.textDecoration) char.style.textDecoration = "none";
					if (char.style.animation) char.style.animation = "none";
					if (char.style.visibility) char.style.visibility = "visible";
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
				const textDecoration = [];
				if (this.underline) textDecoration.push("underline");
				if (this.strikethrough) textDecoration.push("line-through");
				if (textDecoration.length > 0) char.style.textDecoration = textDecoration.join(" ");
				if (this.blinking)      char.style.animation = "terminal-blinking 1s infinite";
				if (this.fastBlinking)  char.style.animation = "terminal-fast-blinking .2s infinite";
				if (this.hidden)        char.style.visibility = "hidden";

				this.cursor.x++;
				break;
			}

			this.lastCharacter = data[i];
		}

		if (this.scrollRegionTop !== null && this.cursor.y < this.scrollRegionTop) {
			this.cursor.y = this.scrollRegionTop;
		}
		if (this.scrollRegionBottom !== null && this.cursor.y >= this.scrollRegionBottom) {
			while (this.cursor.y >= this.scrollRegionBottom) {
				this.ScrollUp(1);
				this.cursor.y--;
			}
		}

		this.TrimHistory();

		this.cursorElement.style.left = Terminal.CHAR_WIDTH * this.cursor.x + "px";
		this.cursorElement.style.top = Terminal.CHAR_HEIGHT * this.cursor.y + "px";

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
		if (index + 1 >= data.length) return null;

		switch (data[index + 1]) {
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
			this.SaveCursorState();
			return 2;

		case "8": //restore cursor position
			this.RestoreCursorState();
			return 2;

		case "D": //index
			this.Index();
			return 2;

		case "E": //next line
			this.cursor.x = 0;
			this.Index();
			return 2;

		case "M": //reverse index
			this.ReverseIndex();
			return 2;

		case "c": //reset to initial state
			this.ResetTerminal();
			return 2;

		default:
			console.warn("Unknown escape sequence: " + data[index + 1]);
			return 2;
		}
	}

	HandleCSI(data, index) { //Control Sequence Introducer
		if (index + 1 >= data.length) return null;

		let offset = index + 2;
		let prefix = "";
		if (offset < data.length && data[offset] >= "<" && data[offset] <= "?") {
			prefix = data[offset++];
		}

		const parameterStart = offset;
		while (offset < data.length && ((data[offset] >= "0" && data[offset] <= "9") || data[offset] === ";" || data[offset] === ":")) {
			offset++;
		}

		const intermediateStart = offset;
		while (offset < data.length && data[offset] >= " " && data[offset] <= "/") {
			offset++;
		}

		if (offset >= data.length) return null;
		if (data[offset] < "@" || data[offset] > "~") return 2;

		const paramsString = data.slice(parameterStart, intermediateStart);
		const command = data[offset];
		const params = paramsString.length === 0 ? [] : paramsString.split(";").map(param => {
			return param === "" ? 0 : parseInt(param, 10);
		});

		switch (command) {
		case "@": this.InsertBlankCharacters(params[0] || 1); break;

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
			switch (params.length === 0 ? 0 : params[0]) {
			case 0: this.EraseFromCursorToEndOfScreen(); break;
			case 1: this.EraseFromCursorToBeginningOfScreen(); break;
			case 2: this.ClearScreen(); break;
			case 3: this.ClearScreenAndBuffer(); break;
			default:
				console.warn(`Unhandled CSI command: ${params.join(";")}J`);
				break;
			}
			break;

		case "K":
			switch (params.length === 0 ? 0 : params[0]) {
			case 0: this.EraseLineFromCursorToEnd(); break;
			case 1: this.EraseLineFromBeginningToCursor(); break;
			case 2: this.ClearLine(); break;
			default:
				console.warn(`Unhandled CSI command: ${params.join(";")}K`);
				break;
			}
			break;

		case "L": this.InsertLines(params[0] || 1); break;
		case "M": this.DeleteLines(params[0] || 1); break;
		case "P": this.DeleteN(params[0] || 1); break;
		case "S": this.ScrollUp(params[0] || 1); break;
		case "T": this.ScrollDown(params[0] || 1); break;
		case "X": this.EraseCharacters(params[0] || 1); break;

		case "d": //move cursor to the specified line
			this.cursor.y = Math.max(0, (params[0] || 1) - 1);
			break;

		case "h": //enable mode
			this.SetMode(prefix, params, true);
			break;

		case "l": //disable mode
			this.SetMode(prefix, params, false);
			break;

		case "m": this.ParseGraphicsModes(params); break;

		case "r": //set scroll region
			this.SetScrollRegion(params[0], params[1]);
			break;

		case "s": //save cursor position
			this.SaveCursorState();
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
			this.RestoreCursorState();
			break;

		default:
			console.warn(`Unhandled CSI command: ${command}`);
			break;
		}

		return offset - index + 1;
	}

	HandleDCS(data, index) { //Device Control String
		if (index + 1 >= data.length) return null;

		const stEnd = data.indexOf("\x1b\\", index + 2);
		if (stEnd === -1) return null;

		const command = data[index + 2] || "";
		console.warn(`Unhandled DCS: ${command}`);
		return stEnd - index + 2;
	}

	HandleOSC(data, index) { //Operating System Command
		if (index + 1 >= data.length) return null;

		const oscEnd = data.indexOf("\x07", index + 2);
		const stEnd = data.indexOf("\x1b\\", index + 2);
		let end = Math.min(oscEnd !== -1 ? oscEnd : data.length, stEnd !== -1 ? stEnd : data.length);
		const terminatorLength = end === stEnd ? 2 : 1;

		if (end === data.length) {
			return null;
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

		return end - index + terminatorLength;
	}

	HandleCSD(data, index) { //Character Set Designation
		if (index + 2 >= data.length) return null;

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
		if (typeof id === "string") {
			if (/^\d+$/.test(id)) {
				id = parseInt(id, 10);
			}
			else {
				return id;
			}
		}

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

		const ramp = [0, 95, 135, 175, 215, 255];
		let v = id - 16;
		let r = ramp[Math.floor(v / 36)];
		let g = ramp[Math.floor((v % 36) / 6)];
		let b = ramp[v % 6];

		return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
	}

	ParseGraphicsModes(params) {
		for (let i=0; i<params.length; i++) {
			switch (params[i]) {
			case 0:
				this.ResetTextAttributes();
				break;

			//set graphics modes
			case 1: this.bold = true; break;
			case 2: this.faint = true; break;
			case 3: this.italic = true; break;
			case 4: this.underline = true; break;
			case 5: this.blinking = true; break;
			case 6: this.fastBlinking = true; break;
			case 7: this.inverse = true; break;
			case 8: this.hidden = true; break;
			case 9: this.strikethrough = true; break;

			//reset graphics modes
			case 22: this.bold = this.faint = false; break;
			case 23: this.italic = false; break;
			case 24: this.underline = false; break;
			case 25: this.blinking = false; break;
			case 26: this.fastBlinking = false; break;
			case 27: this.inverse = false; break;
			case 28: this.hidden = false; break;
			case 29: this.strikethrough = false; break;

			//set foreground color
			case 30: case 31: case 32: case 33: case 34: case 35: case 36: case 37:
				this.foreColor = this.MapColorId(params[i] - 30);
				break;

			case 38: //set foreground color
				if (params[i+1] === 5 && params.length >= i+3) { //id color
					this.foreColor = this.MapColorId(params[i+2]);
					i += 2;
				}
				else if (params[i+1] === 2 && params.length >= i+5) { //rgb color
					this.foreColor = `rgb(${params[i+2]},${params[i+3]},${params[i+4]})`;
					i += 4;
				}
				else {
					console.warn(`Unknown graphics mode: 38;${params[i+1]}`);
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
				if (params[i+1] === 5 && params.length >= i+3) { //id color
					this.backColor = this.MapColorId(params[i+2]);
					i += 2;
				}
				else if (params[i+1] === 2 && params.length >= i+5) { //rgb color
					this.backColor = `rgb(${params[i+2]},${params[i+3]},${params[i+4]})`;
					i += 4;
				}
				else {
					console.warn(`Unknown graphics mode: 48;${params[i+1]}`);
				}
				break;

			case 49: //reset background color
				this.backColor = null;
				break;

			//reset foreground color (bright variants)
			case 90: case 91: case 92: case 93: case 94: case 95: case 96: case 97:
				this.foreColor = this.MapColorId(params[i] - 82);
				break;

			//set background color (bright variants)
			case 100: case 101: case 102: case 103: case 104: case 105: case 106: case 107:
				this.backColor = this.MapColorId(params[i] - 92);
				break;

			default:
				console.warn(`Unknown graphics mode: ${params[i]}`);
				break;
			}
		}
	}

	ScrollUp(lines=1) {
		const top = this.GetScrollRegionTop();
		const bottom = this.GetScrollRegionBottom();
		const amount = Math.min(Math.max(lines, 1), Math.max(0, bottom - top));
		const width = this.GetScreenWidth();

		for (let i=0; i<amount; i++) {
			for (let y=top; y<bottom; y++) {
				for (let x=0; x<width; x++) {
					if (y === top) {
						this.RemoveCell(x, y);
						continue;
					}

					this.MoveCell(x, y, x, y - 1);
				}
			}

			for (let x=0; x<width; x++) {
				this.RemoveCell(x, bottom - 1);
			}
		}
	}

	ScrollDown(lines=1) {
		const top = this.GetScrollRegionTop();
		const bottom = this.GetScrollRegionBottom();
		const amount = Math.min(Math.max(lines, 1), Math.max(0, bottom - top));
		const width = this.GetScreenWidth();

		for (let i=0; i<amount; i++) {
			for (let y=bottom - 1; y>=top; y--) {
				for (let x=0; x<width; x++) {
					if (y === bottom - 1) {
						this.RemoveCell(x, y);
						continue;
					}

					this.MoveCell(x, y, x, y+1);
				}
			}

			for (let x=0; x<width; x++) {
				this.RemoveCell(x, top);
			}
		}
	}

	EnableAlternateScreen() { //?1049h
		this.savedScreen = this.screen;
		this.ClearScreen();
		this.SaveCursorState();
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

			this.RestoreCursorState();
		}
	}

	DeleteN(n) { //P
		const width = this.GetScreenWidth();
		for (let x=this.cursor.x; x<width; x++) {
			const sourceX = x + n;
			if (sourceX < width) {
				this.MoveCell(sourceX, this.cursor.y, x, this.cursor.y);
			}
			else {
				this.RemoveCell(x, this.cursor.y);
			}
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
			this.RemoveCell(i, this.cursor.y);
		}
	}

	ClearLine() { //2K
		const w = this.GetScreenWidth();
		for (let i=0; i<w; i++) {
			this.RemoveCell(i, this.cursor.y);
		}
	}

	InsertBlankCharacters(n) { //@
		const width = this.GetScreenWidth();
		const amount = Math.min(Math.max(n, 1), Math.max(0, width - this.cursor.x));
		for (let x=width - 1; x>=this.cursor.x + amount; x--) {
			this.MoveCell(x - amount, this.cursor.y, x, this.cursor.y);
		}
		for (let x=this.cursor.x; x<this.cursor.x + amount; x++) {
			this.RemoveCell(x, this.cursor.y);
		}
	}

	EraseCharacters(n) { //X
		const width = this.GetScreenWidth();
		const end = Math.min(width, this.cursor.x + Math.max(n, 1));
		for (let x=this.cursor.x; x<end; x++) {
			this.RemoveCell(x, this.cursor.y);
		}
	}

	InsertLines(n) { //L
		const top = this.cursor.y;
		const bottom = this.GetScrollRegionBottom();
		if (top < this.GetScrollRegionTop() || top >= bottom) return;

		const amount = Math.min(Math.max(n, 1), bottom - top);
		const width = this.GetScreenWidth();

		for (let y=bottom - 1; y>=top; y--) {
			for (let x=0; x<width; x++) {
				if (y - amount >= top) {
					this.MoveCell(x, y - amount, x, y);
				}
				else {
					this.RemoveCell(x, y);
				}
			}
		}
	}

	DeleteLines(n) { //M
		const top = this.cursor.y;
		const bottom = this.GetScrollRegionBottom();
		if (top < this.GetScrollRegionTop() || top >= bottom) return;

		const amount = Math.min(Math.max(n, 1), bottom - top);
		const width = this.GetScreenWidth();

		for (let y=top; y<bottom; y++) {
			for (let x=0; x<width; x++) {
				if (y + amount < bottom) {
					this.MoveCell(x, y + amount, x, y);
				}
				else {
					this.RemoveCell(x, y);
				}
			}
		}
	}

	Index() {
		const bottom = this.GetScrollRegionBottom();
		if (this.cursor.y === bottom - 1) {
			this.ScrollUp(1);
			return;
		}

		this.cursor.y++;
	}

	ReverseIndex() {
		const top = this.GetScrollRegionTop();
		if (this.cursor.y === top) {
			this.ScrollDown(1);
			return;
		}

		this.cursor.y = Math.max(0, this.cursor.y - 1);
	}

	SetMode(prefix, params, enabled) {
		for (const mode of params) {
			switch (mode) {
			case 1:
				this.appCursorKeys = enabled;
				break;

			case 4:
				if (prefix === "") this.insertMode = enabled;
				else console.warn(`Unhandled ${prefix}${mode}${enabled ? "h" : "l"} mode`);
				break;

			case 7:
				this.lineWrappingMode = enabled;
				break;

			case 12:
				this.localEchoMode = enabled;
				break;

			case 25:
				this.cursorElement.style.visibility = enabled ? "visible" : "hidden";
				break;

			case 1000:
			case 1002:
			case 1003:
			case 1005:
			case 1006:
			case 1015:
				// Mouse tracking is negotiated by the remote side; this base terminal
				// accepts the mode change even if it does not emit mouse reports yet.
				break;

			case 1049:
				if (enabled) this.EnableAlternateScreen();
				else this.DisableAlternateScreen();
				break;

			case 2004:
				this.bracketedMode = enabled;
				break;

			default:
				console.warn(`Unhandled ${enabled ? "enable" : "disable"} mode: ${prefix}${mode}${enabled ? "h" : "l"}`);
				break;
			}
		}
	}

	SetScrollRegion(top, bottom) {
		const screenHeight = this.GetScreenHeight();
		const newTop = Math.max(0, (top || 1) - 1);
		const newBottom = Math.min(screenHeight, bottom || screenHeight);

		if (newTop >= newBottom) {
			this.scrollRegionTop = null;
			this.scrollRegionBottom = null;
		}
		else if (newTop === 0 && newBottom === screenHeight) {
			this.scrollRegionTop = null;
			this.scrollRegionBottom = null;
		}
		else {
			this.scrollRegionTop = newTop;
			this.scrollRegionBottom = newBottom;
		}

		this.cursor.x = 0;
		this.cursor.y = 0;
	}

	GetScrollbackLimit() {
		const value = Number.parseInt(this.args.scrollback ?? this.args.historyLimit ?? Terminal.DEFAULT_SCROLLBACK, 10);
		return Number.isNaN(value) ? Terminal.DEFAULT_SCROLLBACK : Math.max(0, value);
	}

	GetHistoryLineLimit() {
		return this.GetScreenHeight() + this.GetScrollbackLimit();
	}

	GetScrollRegionTop() {
		return this.scrollRegionTop ?? 0;
	}

	GetScrollRegionBottom() {
		return this.scrollRegionBottom ?? this.GetScreenHeight();
	}

	GetBufferBottom() {
		let bottom = this.cursor.y;

		if (this.savedCursorPos) {
			bottom = Math.max(bottom, this.savedCursorPos.y);
		}

		for (const key in this.screen) {
			const split = key.indexOf(",");
			const y = parseInt(key.substring(split+1), 10);
			if (!Number.isNaN(y)) {
				bottom = Math.max(bottom, y);
			}
		}

		return bottom;
	}

	ShiftTrackedPosition(position, lines) {
		if (!position) return;
		position.y = Math.max(0, position.y - lines);
	}

	TrimHistory() {
		const limit = this.GetHistoryLineLimit();
		if (limit <= 0) return;

		const overflow = this.GetBufferBottom()+1 - limit;
		if (overflow <= 0) return;

		const previousScrollTop = this.content.scrollTop;
		const removedHeight = overflow * Terminal.CHAR_HEIGHT;
		const newScreen = {};

		for (const key in this.screen) {
			const split = key.indexOf(",");
			const x = key.substring(0, split);
			const y = parseInt(key.substring(split+1), 10);
			const cell = this.screen[key];

			if (Number.isNaN(y)) continue;

			if (y < overflow) {
				if (cell.parentNode === this.content) {
					this.content.removeChild(cell);
				}
				continue;
			}

			const newY = y - overflow;
			newScreen[`${x},${newY}`] = cell;
			cell.style.top = `${newY * Terminal.CHAR_HEIGHT}px`;
		}

		this.screen = newScreen;
		this.ShiftTrackedPosition(this.cursor, overflow);
		this.ShiftTrackedPosition(this.savedCursorPos, overflow);

		if (this.scrollRegionTop !== null) {
			this.scrollRegionTop = Math.max(0, this.scrollRegionTop - overflow);
		}
		if (this.scrollRegionBottom !== null) {
			this.scrollRegionBottom = Math.max(0, this.scrollRegionBottom - overflow);
			if (this.scrollRegionBottom <= this.scrollRegionTop) {
				this.scrollRegionTop = null;
				this.scrollRegionBottom = null;
			}
		}

		this.content.scrollTop = Math.max(0, previousScrollTop - removedHeight);
	}

	RemoveCell(x, y) {
		const key = `${x},${y}`;
		if (!this.screen[key]) return;
		if (this.screen[key].parentNode === this.content) {
			this.content.removeChild(this.screen[key]);
		}
		delete this.screen[key];
	}

	MoveCell(fromX, fromY, toX, toY) {
		const fromKey = `${fromX},${fromY}`;
		const cell = this.screen[fromKey];

		this.RemoveCell(toX, toY);
		if (!cell) return;

		delete this.screen[fromKey];
		this.screen[`${toX},${toY}`] = cell;
		cell.style.left = `${toX * Terminal.CHAR_WIDTH}px`;
		cell.style.top = `${toY * Terminal.CHAR_HEIGHT}px`;
	}

	ResetTerminal() {
		this.InitializeTerminalState();
		this.ResetTextAttributes();
		this.ClearScreen();
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
