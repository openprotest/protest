class Terminal extends Window {
	static CURSOR_WIDTH = 8;
	static CURSOR_HEIGHT = 18;

	constructor(params) {
		super();

		this.params = params ? params : {host:"", ansi:true, autoScroll:true, bell:false};

		this.AddCssDependencies("terminal.css");

		this.cursor = {x:0, y:0};
		this.chars  = {};

		this.savedCursorPos = null;
		this.savedLine      = null;
		this.savedScreen    = null;

		this.foreColor       = null;
		this.backColor       = null;
		this.isBold          = false;
		this.isDim           = false;
		this.isItalic        = false;
		this.isUnderline     = false;
		this.isBlinking      = false;
		this.isFastBlinking  = false;
		this.isInverse       = false;
		this.isHidden        = false;
		this.isStrikethrough = false;

		this.ws = null;

		this.SetupToolbar();
		this.connectButton = this.AddToolbarButton("Connect", "mono/connect.svg?light");
		this.optionsButton = this.AddToolbarButton("Options", "mono/wrench.svg?light");
		this.AddToolbarSeparator();
		this.pasteButton = this.AddToolbarButton("Paste", "mono/clipboard.svg?light");
		this.sendKeyButton = this.AddToolbarButton("Send key", "mono/keyboard.svg?light");

		this.sendKeyButton.disabled = true;

		this.content.tabIndex = 1;
		this.content.classList.add("terminal-content");

		this.cursorElement = document.createElement("div");
		this.cursorElement.className = "terminal-cursor";

		this.statusBox = document.createElement("div");
		this.statusBox.className = "terminal-status-box";
		this.statusBox.textContent = "Connecting...";

		this.win.onclick = ()=> this.content.focus();
		this.content.onfocus = ()=> this.BringToFront();
		this.content.onkeydown = event=> this.Terminal_onkeydown(event);

		this.connectButton.onclick = ()=> this.ConnectDialog(this.params.host);
		this.optionsButton.onclick = ()=> this.OptionsDialog();
		this.pasteButton.onclick   = ()=> this.ClipboardDialog();
		this.sendKeyButton.onclick = ()=> this.CustomKeyDialog();

		//preload icon:
		const disconnectIcon = new Image();
		disconnectIcon.src = "mono/disconnect.svg";
	}

	Close() { //overrides
		if (this.ws != null) this.ws.close();
		super.Close();
	}

	AfterResize() { //overrides
		super.AfterResize();
		//TODO:
	}

	ConnectDialog(target="", isNew=false) {} //overridable

	OptionsDialog() {
		const dialog = this.DialogBox("200px");
		if (dialog === null) return;

		const okButton = dialog.okButton;
		const cancelButton = dialog.cancelButton;
		const innerBox = dialog.innerBox;

		innerBox.style.padding = "20px";
		innerBox.parentElement.style.maxWidth = "480px";
		innerBox.parentElement.parentElement.onclick = event=> { event.stopPropagation(); };

		const ansiCheckbox = document.createElement("input");
		ansiCheckbox.type = "checkbox";
		ansiCheckbox.checked = this.params.ansi;
		innerBox.appendChild(ansiCheckbox);
		this.AddCheckBoxLabel(innerBox, ansiCheckbox, "Escape ANSI codes");

		innerBox.appendChild(document.createElement("br"));
		innerBox.appendChild(document.createElement("br"));

		const bellCheckbox = document.createElement("input");
		bellCheckbox.type = "checkbox";
		bellCheckbox.checked = this.params.bell;
		innerBox.appendChild(bellCheckbox);
		this.AddCheckBoxLabel(innerBox, bellCheckbox, "Play bell sound");

		innerBox.appendChild(document.createElement("br"));
		innerBox.appendChild(document.createElement("br"));

		const autoScrollCheckbox = document.createElement("input");
		autoScrollCheckbox.type = "checkbox";
		autoScrollCheckbox.checked = this.params.autoScroll;
		innerBox.appendChild(autoScrollCheckbox);
		this.AddCheckBoxLabel(innerBox, autoScrollCheckbox, "Auto-scroll");

		okButton.onclick = ()=> {
			this.params.ansi = ansiCheckbox.checked;
			this.params.bell = bellCheckbox.checked;
			this.params.autoScroll = autoScrollCheckbox.checked;
			dialog.Close();
		};
	}

	CustomKeyDialog() {
		const dialog = this.DialogBox("180px");
		if (dialog === null) return;

		const okButton = dialog.okButton;
		const innerBox = dialog.innerBox;

		okButton.value = "Send";
		okButton.disabled = true;

		innerBox.style.padding = "20px";
		innerBox.parentElement.style.maxWidth = "500px";
		innerBox.parentElement.parentElement.onclick = event=> { event.stopPropagation(); };

		const keyLabel = document.createElement("div");
		keyLabel.style.display = "inline-block";
		keyLabel.style.minWidth = "50px";
		keyLabel.textContent = "Key:";
		innerBox.appendChild(keyLabel);

		const keyInput = document.createElement("input");
		keyInput.type = "text";
		keyInput.setAttribute("maxlength", "1");
		keyInput.style.textAlign = "center";
		keyInput.style.width = "64px";
		innerBox.appendChild(keyInput);

		innerBox.appendChild(document.createElement("br"));
		innerBox.appendChild(document.createElement("br"));

		const shiftCheckbox = document.createElement("input");
		shiftCheckbox.type = "checkbox";
		shiftCheckbox.checked = false;
		innerBox.appendChild(shiftCheckbox);
		this.AddCheckBoxLabel(innerBox, shiftCheckbox, "Shift").style.margin = "4px 1px";

		const ctrlCheckbox = document.createElement("input");
		ctrlCheckbox.type = "checkbox";
		ctrlCheckbox.checked = false;
		innerBox.appendChild(ctrlCheckbox);
		this.AddCheckBoxLabel(innerBox, ctrlCheckbox, "Ctrl").style.margin = "4px 1px";

		const altCheckbox = document.createElement("input");
		altCheckbox.type = "checkbox";
		altCheckbox.checked = false;
		innerBox.appendChild(altCheckbox);
		this.AddCheckBoxLabel(innerBox, altCheckbox, "Alt").style.margin = "4px 1px";

		const altGrCheckbox = document.createElement("input");
		altGrCheckbox.type = "checkbox";
		altGrCheckbox.checked = false;
		innerBox.appendChild(altGrCheckbox);
		this.AddCheckBoxLabel(innerBox, altGrCheckbox, "Alt gr").style.margin = "4px 1px";

		keyInput.onchange = keyInput.oninput = ()=> {
			okButton.disabled = keyInput.value.length === 0;
		};

		keyInput.onkeydown = event=> {
			if (event.key === "Enter" && !okButton.disabled) {
				dialog.okButton.click();
			}
		};

		okButton.onclick = ()=> {
			dialog.Close();
			//TODO: Send key
		};

		setTimeout(()=>{ keyInput.focus(); }, 200);
	}

	async ClipboardDialog() {
		const dialog = this.DialogBox("128px");
		if (dialog === null) return;

		const okButton = dialog.okButton;
		const innerBox = dialog.innerBox;

		okButton.value = "Paste";
		okButton.disabled = true;

		innerBox.style.padding = "20px";
		innerBox.parentElement.style.maxWidth = "560px";
		innerBox.parentElement.parentElement.onclick = event=> { event.stopPropagation(); };

		const keyText = document.createElement("input");
		keyText.type = "text";
		keyText.style.width = "calc(100% - 8px)";
		keyText.style.boxSizing = "border-box";
		innerBox.appendChild(keyText);

		try {
			keyText.value = await navigator.clipboard.readText();
			okButton.disabled = keyText.value.length === 0;
		}
		catch (ex) {
			dialog.Close();
			setTimeout(()=>{ this.ConfirmBox(ex, true, "mono/error.svg"); }, 250);
		}

		keyText.onchange = keyText.oninput = ()=> {
			okButton.disabled = keyText.value.length === 0;
		};

		okButton.onclick = ()=> {
			dialog.Close();
			if (this.ws === null || this.ws.readyState != 1) {
				return;
			}
			this.ws.send(keyText.value);
		};

		setTimeout(()=>{ keyText.focus(); }, 200);
	}

	Terminal_onkeydown(event) {
		event.preventDefault();
	
		if (this.ws === null || this.ws.readyState != 1) {
			return;
		}

		if (event.ctrlKey && event.key.length === 1) {
			switch (event.code) {
			case "KeyA": this.ws.send("\x01"); return;
			case "KeyB": this.ws.send("\x02"); return;
			case "KeyC": this.ws.send("\x03"); return;
			case "KeyD": this.ws.send("\x04"); return;
			case "KeyE": this.ws.send("\x05"); return;
			case "KeyF": this.ws.send("\x06"); return;
			case "KeyG": this.ws.send("\x07"); return;
			case "KeyH": this.ws.send("\x08"); return;
			case "KeyI": this.ws.send("\x09"); return;
			case "KeyJ": this.ws.send("\x10"); return;
			case "KeyK": this.ws.send("\x11"); return;
			case "KeyL": this.ws.send("\x12"); return;
			case "KeyM": this.ws.send("\x13"); return;
			case "KeyN": this.ws.send("\x14"); return;
			case "KeyO": this.ws.send("\x15"); return;
			case "KeyP": this.ws.send("\x16"); return;
			case "KeyQ": this.ws.send("\x17"); return;
			case "KeyR": this.ws.send("\x18"); return;
			case "KeyS": this.ws.send("\x19"); return;
			case "KeyT": this.ws.send("\x20"); return;
			case "KeyU": this.ws.send("\x21"); return;
			case "KeyV": this.ws.send("\x22"); return;
			case "KeyW": this.ws.send("\x23"); return;
			case "KeyX": this.ws.send("\x24"); return;
			case "KeyY": this.ws.send("\x25"); return;
			case "KeyZ": this.ws.send("\x26"); return;
			}
		}
		else if (event.ctrlKey) {
			//TODO: ctrl+key
		}

		if (event.key.length === 1) {
			this.ws.send(event.key);
			return;
		}

		switch(event.key) {
		case "Enter":
			if (this instanceof Ssh) {
				this.ws.send("\n");
				return;
			}
			else {
				this.ws.send("\r\n");
				return;
			}

		case "Tab"       : this.ws.send("\t"); return;
		case "Backspace" : this.ws.send("\x08"); return;
		case "Delete"    : this.ws.send("\x1b[3~"); return;
		case "ArrowLeft" : this.ws.send("\x1b[D"); return;
		case "ArrowRight": this.ws.send("\x1b[C"); return;
		case "ArrowUp"   : this.ws.send("\x1b[A"); return;
		case "ArrowDown" : this.ws.send("\x1b[B"); return;
		case "Home"      : this.ws.send("\x1b[H"); return;
		case "End"       : this.ws.send("\x1b[F"); return;
		}
	}

	HandleMessage(data) {
		for (let i=0; i<data.length; i++) {
			let char = this.chars[`${this.cursor.x},${this.cursor.y}`];
	
			if (!char) {
				char = document.createElement("span");
				char.style.left = `${this.cursor.x * Terminal.CURSOR_WIDTH}px`;
				char.style.top = `${this.cursor.y * Terminal.CURSOR_HEIGHT}px`;
	
				this.content.appendChild(char);
				this.chars[`${this.cursor.x},${this.cursor.y}`] = char;
			}

			switch (data[i]) {
			case " ": //space
				char.innerHTML = "&nbsp;";
				this.cursor.x++;
				break;

			case "\x07":
				if (this.params.bell) this.Bell();
				this.cursorElement.style.animation = "terminal-shake .4s 1";
				setTimeout(()=>{ this.cursorElement.style.animation = "terminal-blinking 1.2s infinite"; }, 400);
				break;

			//TODO:
			case "\x08": //backspace or move left
				this.cursor.x = Math.max(0, this.cursor.x - 1);
				break;

			//case "\x09": break; //tab

			case "\x0a": //lf
				char.innerHTML = "<br>";
				this.cursor.x = 0;
				this.cursor.y++;
				break;

			//case "\x0b": break; //vertical tab
			//case "\x0c": break; //new page.

			case "\x0d": //cr
				if (i+1 < data.length && data[i+1] === "\x0a") {
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
				if (this.params.ansi) {
					i += this.HandleEscSequence(data, i) - 1;
				}
				else {
					char.textContent = data[i];
				}
				break;

			//case "\x7f": break; //delete

			default:
				char.textContent = data[i];
				
				let foreColor, backColor;
				if (this.isInverse) {
					foreColor = this.backColor ?? "rgb(32,32,32)";
					backColor = this.foreColor ?? "rgb(224,224,224)";
				}
				else {
					foreColor = this.foreColor;
					backColor = this.backColor;
				}

				if (foreColor) char.style.color = foreColor;
				if (backColor) char.style.backgroundColor = backColor;

				if (this.isBold)          char.style.fontWeight = "bold";
				if (this.isDim)           char.style.opacity = "0.6";
				if (this.isItalic)        char.style.fontStyle = "italic";
				if (this.isUnderline)     char.style.textDecoration = "underline";
				if (this.isBlinking)      char.style.animation = "terminal-blinking 1s infinite";
				if (this.isFastBlinking)  char.style.animation = "terminal-fast-blinking .2s infinite";
				if (this.isHidden)        char.style.visibility = "hidden";
				if (this.isStrikethrough) char.style.textDecoration = "line-through";

				this.cursor.x++;
				break;
			}

			this.lastCharacter = data[i];
		}

		this.cursorElement.style.left = Terminal.CURSOR_WIDTH * this.cursor.x + "px";
		this.cursorElement.style.top = Terminal.CURSOR_HEIGHT * this.cursor.y + "px";

		if (this.params.autoScroll) {
			this.cursorElement.scrollIntoView();
		}
	}

	HandleEscSequence(data, index) { //Control Sequence Introducer
		if (data[index+1] === "[" || data[index+1] === "\x9b") {
			return this.HandleCSI(data, index);
		}

		if (data[index+1] === "P" || data[index+1] === "\x90") {
			return this.HandleDCS(data, index);
		}

		if (data[index+1] === "]" || data[index+1] === "\x9d") {
			return this.HandleOSC(data, index);
		}

		console.warn("Unknown escape sequence: " + data[index+1]);
		return 1;
	}

	HandleCSI(data, index) { //Control Sequence Introducer
		if (index >= data.length) return 2;
		
		let symbol = null;
		let values = [];
		let command = null;

		let i = index + 2;
		while (i < data.length) {
			if (this.IsLetter(data, i)) { //command
				command = data[i++];
				break;
			}
			
			if (!isNaN(data[i])) { //number
				let n = parseInt(data[i]);
				while (!isNaN(data[++i]) && i < data.length) {
					n *= 10;
					n += parseInt(data[i]);
				}
				values.push(n);
				continue;
			}
			
			switch (data[i]) {
			case ";": symbol = ";"; break; //separator
			case "=": symbol = "="; break; //screen mode
			case "?": symbol = "?"; break; //private modes
			default:
				console.warn("Unknown token: " + data[i]);
				break;
			}

			i++;
		}

		//common private modes
		if (symbol === "?") {
			if (values.length === 1 && values[0] === 25) {
				if (command === "l") {
					this.cursorElement.style.visibility = "hidden";
					return 6;
				}

				if (command === "h") {
					this.cursorElement.style.visibility = "visible";
					return 6;
				}
			}
		}

		switch (command) {
		case "A": //cursor up
			this.cursor.y = Math.max(0, this.cursor.y - values[0] ?? 1);
			break;

		case "B": //cursor down
			this.cursor.y += values[0] ?? 1;
			break;

		case "C": //cursor right
			this.cursor.x += values[0] ?? 1;
			break;

		case "D": //cursor left
			this.cursor.x = Math.max(0, this.cursor.x - values[0] ?? 1);
			break;

		case "E": //cursor to beginning of next line, n lines down
			this.cursor.x = 0;
			this.cursor.y += values[0] ?? 1;
			break;

		case "F": //cursor to beginning of previous line, n lines up
			this.cursor.x = 0;
			this.cursor.y = Math.max(0, this.cursor.y - values[0] ?? 1);

		case "G": //cursor to column n
			if (values.length > 0) break;
			this.cursor.x = values[0];
			break;

		case "f":
		case "H": //cursor to home position (0,0)
			if (values.length === 0) {
				this.cursor.x = 0;
				this.cursor.y = 0;
				return 3;
			}
			else if (values.length > 1) {
				this.cursor.x = values[1];
				this.cursor.y = values[0];
			}
			break;

		case "J":
			if (values.length === 0) { //same as J0
				this.EraseFromCursorToEndOfScreen();
				return 3;
			}
			if (values[0] === 0) {
				this.EraseFromCursorToEndOfScreen();
				return 4;
			}
			else if (values[0] === 1) {
				this.EraseFromCursorToBeginningOfScreen();
				return 4;
			}
			else if (values[0] === 2) {
				this.ClearScreen();
				return 4;
			}
			else if (values[0] === 3) {
				this.ClearScreen();
				//TODO: clear screen and buffer
				return 4;
			}
			break;

		case "K":
			if (values.length === 0) { //same as K0
				this.EraseLineFromCursorToEnd();
				return 3;
			}
			if (values[0] === 0) {
				this.EraseLineFromCursorToEnd();
				return 4;
			}
			if (values[0] === 1) {
				this.EraseLineFromBeginningToCursor();
				return 4;
			}
			if (values[0] === 2) {
				this.ClearLine();
				return 4;
			}
			break;

		//case "S": break; //not ANSI
		//case "T": break; //not ANSI
		
		case "P": //delete n chars
			if (values.length === 0) break;

			//find last character in current line
			let x;
			for (x=this.cursor.x; x<this.GetScreenWidth(); x++) {
				const key = `${x},${this.cursor.y}`;
				if (!this.chars[key]) {
					x--;
					break;
				}
			}

			for (let p=0; p<=values[0]; p++) {
				const key = `${x-p},${this.cursor.y}`;
				if (!this.chars[key]) continue;
				this.content.removeChild(this.chars[key]);
				delete this.chars[key];
			}
			break;

		case "m": //graphics modes
			if (values.length === 0) { //same as reset?
				this.foreColor       = null;
				this.backColor       = null;
				this.isBold          = false;
				this.isDim           = false;
				this.isItalic        = false;
				this.isUnderline     = false;
				this.isBlinking      = false;
				this.isFastBlinking  = false;
				this.isInverse       = false;
				this.isHidden        = false;
				this.isStrikethrough = false;
				return 3;
			}

			for (let p=0; p<values.length; p++) {
				switch (values[p]) {
				
				case 0: //reset all graphics modes
					this.foreColor       = null;
					this.backColor       = null;
					this.isBold          = false;
					this.isDim           = false;
					this.isItalic        = false;
					this.isUnderline     = false;
					this.isBlinking      = false;
					this.isFastBlinking  = false;
					this.isInverse       = false;
					this.isHidden        = false;
					this.isStrikethrough = false;
					break;
				
				//set graphics modes
				case 1: this.isBold          = true; break;
				case 2: this.isDim           = true; break;
				case 3: this.isItalic        = true; break;
				case 4: this.isUnderline     = true; break;
				case 5: this.isBlinking      = true; break;
				case 6: this.isFastBlinking  = true; break;
				case 7: this.isInverse       = true; break;
				case 8: this.isHidden        = true; break;
				case 9: this.isStrikethrough = true; break;

				//reset graphics modes
				case 22: this.isBold = this.isDim = false; break;
				case 23: this.isItalic        = false; break;
				case 24: this.isUnderline     = false; break;
				case 25: this.isBlinking      = false; break;
				case 26: this.isFastBlinking  = false; break;
				case 27: this.isInverse       = false; break;
				case 28: this.isHidden        = false; break;
				case 29: this.isStrikethrough = false; break;
		
				//set foreground color
				case 30: this.foreColor = "#111";    break; //black
				case 31: this.foreColor = "#de382b"; break; //red
				case 32: this.foreColor = "#39b54a"; break; //green
				case 33: this.foreColor = "#e1c706"; break; //yellow
				case 34: this.foreColor = "#3080D8"; break; //blue
				case 35: this.foreColor = "#bc3fbc"; break; //magenta
				case 36: this.foreColor = "#2cb5e9"; break; //cyan
				case 37: this.foreColor = "#ccc"; break;    //white
				case 39: this.foreColor = null; break;
				case 90: this.foreColor = "#888"; break; //gray
				case 91: this.foreColor = "#f00"; break; //bright red
				case 92: this.foreColor = "#0f0"; break; //bright green
				case 93: this.foreColor = "#ff0"; break; //bright yellow
				case 94: this.foreColor = "#00f"; break; //bright blue
				case 95: this.foreColor = "#f0f"; break; //bright magenta
				case 96: this.foreColor = "#0ff"; break; //bright cyan
				case 97: this.foreColor = "#eee"; break; //bright white

				//set background color
				case 40: this.backColor = "#111";    break; //black
				case 41: this.backColor = "#de382b"; break; //red
				case 42: this.backColor = "#39b54a"; break; //green
				case 43: this.backColor = "#e1c706"; break; //yellow
				case 44: this.backColor = "#3080D8"; break; //blue
				case 45: this.backColor = "#bc3fbc"; break; //magenta
				case 46: this.backColor = "#2cb5e9"; break; //cyan
				case 47: this.backColor = "#ccc"; break;    //white
				case 49: this.backColor = null; break;
				case 100: this.backColor = "#888"; break; //gray
				case 101: this.backColor = "#f00"; break; //bright red
				case 102: this.backColor = "#0f0"; break; //bright green
				case 103: this.backColor = "#ff0"; break; //bright yellow
				case 104: this.backColor = "#00f"; break; //bright blue
				case 105: this.backColor = "#f0f"; break; //bright magenta
				case 106: this.backColor = "#0ff"; break; //bright cyan
				case 107: this.backColor = "#eee"; break; //bright white


				case 38: //set foreground color
					if (values.length < 3) break;
					if (values.length < 3) break;

					if (values[1] === 5) { //id color
						if (values.length < 3) break;
						this.foreColor = this.MapColorId(values[2]);
					}
					else if (values[1] === 2) { //rgb color
						if (values.length < 6) break;
						this.foreColor = `rgb(${values[2]},${values[3]},${values[4]})`;
					}
					else {
						console.warn(`Unknown graphics mode: 38;${values[1]}`);
					}

				case 48: //set background color
					if (values.length < 3) break;

					if (values[1] === 5) { //id color
						if (values.length < 3) break;
						this.backColor = this.MapColorId(values[2]);
					}
					else if (values[1] === 2) { //rgb color
						if (values.length < 6) break;
						this.backColor = `rgb(${values[2]},${values[3]},${values[4]})`;
					}
					else {
						console.warn(`Unknown graphics mode: 48;${values[1]}`);
					}

				default:
					console.warn(`Unknown graphics mode: ${values[p]}`);
				}
			}

			break;

		case "s": //save cursor position
			this.savedCursorPos = {x:this.cursor.x, y:this.cursor.y};
			break;

		case "u": //restore cursor position
			this.cursor.x = this.savedCursorPos.x;
			this.cursor.y = this.savedCursorPos.y;
			break;

		default:
			console.warn(`Unknown CSI command: ${symbol ?? ""}${values.join(";")}${command}`);
			break;
		}

		return i - index;
	}

	HandleDCS(data, index) { //Device Control String
		if (index >= data.length) return 2;

		console.warn("Unknown DCS: " + data[index+2]);
		return 2;
	}

	HandleOSC(data, index) { //Operating System Command
		if (index >= data.length) return 2;

		console.warn("Unknown OCS: " + data[index+2]);
		return 2;
	}

	MapColorId(id) {
		switch (id) {
			case 0: return "#111";
			case 1: return "#de382b";
			case 2: return "#39b54a";
			case 3: return "#e1c706";
			case 4: return "#3080D8";
			case 5: return "#bc3fbc";
			case 6: return "#2cb5e9";
			case 7: return "#ccc";
		
			case 8: return "#888";
			case 9: return "#f00";
			case 10: return "#0f0";
			case 11: return "#ff0";
			case 12: return "#00f";
			case 13: return "#f0f";
			case 14: return "#0ff";
			case 15: return "#fff";
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

	IsLetter(string, index) {
		const code = string.charCodeAt(index);
		if (code > 64 && code < 91) return true;
		if (code > 96 && code < 123) return true;
		return false;
	}

	ClearLine() {
		const w = this.GetScreenWidth();
		for (let i=0; i<w; i++) {
			const key = `${i},${this.cursor.y}`;
			if (!this.chars[key]) continue;
			this.content.removeChild(this.chars[key]);
			delete this.chars[key];
		}
	}

	EraseFromCursorToEndOfScreen() { //0J
		const w = this.GetScreenWidth();
		const h = this.GetScreenHeight();
		const c = w * (this.cursor.y) + this.cursor.x;

		for (let y=0; y<h; y++) {
			for (let x=0; x<w; x++) {
				if (w*y + x <= c) continue;
				const key = `${x},${y}`;
				if (!this.chars[key]) continue;
				this.content.removeChild(this.chars[key]);
				delete this.chars[key];
			}
		}
	}

	EraseFromCursorToBeginningOfScreen() { //1J
		const w = this.GetScreenWidth();
		const h = this.GetScreenHeight();
		const c = w * (this.cursor.y) + this.cursor.x;

		for (let y=0; y<h; y++) {
			for (let x=0; x<w; x++) {
				if (w*y + x > c) continue;
				const key = `${x},${y}`;
				if (!this.chars[key]) continue;
				this.content.removeChild(this.chars[key]);
				delete this.chars[key];
			}
		}
	}

	ClearScreen() { //2J
		this.chars = {};
		this.content.innerHTML = "";
		this.content.appendChild(this.cursorElement);
	}

	EraseLineFromCursorToEnd() { //0K
		const w = this.GetScreenWidth();
		for (let i=this.cursor.x; i<w; i++) {
			const key = `${i},${this.cursor.y}`;
			if (!this.chars[key]) continue;
			this.content.removeChild(this.chars[key]);
			delete this.chars[key];
		}
	}

	EraseLineFromBeginningToCursor() { //1K
		for (let i=0; i<=this.cursor.x; i++) {
			const key = `${i},${this.cursor.y}`;
			if (!this.chars[key]) continue;
			this.chars[key].textContent = " ";
		}
	}

	ClearLine() { //2K
		const w = this.GetScreenWidth();
		for (let i=0; i<w; i++) {
			const key = `${i},${this.cursor.y}`;
			if (!this.chars[key]) continue;
			this.content.removeChild(this.chars[key]);
			delete this.chars[key];
		}
	}

	GetScreenWidth() {
		return parseInt(this.content.clientWidth / Terminal.CURSOR_WIDTH);
	}

	GetScreenHeight() {
		return parseInt(this.content.clientHeight / Terminal.CURSOR_HEIGHT);
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