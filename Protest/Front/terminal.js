class Terminal extends Window {
	static CURSOR_WIDTH = 8;
	static CURSOR_HEIGHT = 18;

	constructor(params) {
		super();

		this.params = params ? params : {host:"", ansi:true, autoScroll:true, bell:false};

		if (!("ansi" in this.params)) this.params.ansi = true;
		if (!("autoScroll" in this.params)) this.params.autoScroll = true;
		if (!("bell" in this.params)) this.params.autoScroll = false;

		this.AddCssDependencies("terminal.css");

		this.cursor = {x:0, y:0};
		this.screen = {};

		this.savedCursorPos = null;
		this.savedLine      = null;
		this.savedScreen    = null;
		this.bracketedMode = false;

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

		this.ws = null;

		this.SetupToolbar();
		this.connectButton = this.AddToolbarButton("Connect", "mono/connect.svg?light");
		this.optionsButton = this.AddToolbarButton("Options", "mono/wrench.svg?light");
		this.AddToolbarSeparator();
		this.saveText = this.AddToolbarButton("Save text", "mono/floppy.svg?light");
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
		autoScrollCheckbox.checked = this.params.autoScroll ?? true;
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
			if (this.bracketedMode) {
				this.ws.send(`\x1b[200~${keyText.value}\x1b[201~`);
			}
			else {
				this.ws.send(keyText.value);
			}
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
			let char = this.screen[`${this.cursor.x},${this.cursor.y}`];
	
			if (!char) {
				char = document.createElement("span");
				char.style.left = `${this.cursor.x * Terminal.CURSOR_WIDTH}px`;
				char.style.top = `${this.cursor.y * Terminal.CURSOR_HEIGHT}px`;	
				this.content.appendChild(char);
				this.screen[`${this.cursor.x},${this.cursor.y}`] = char;
			}

			switch (data[i]) {
			case " ":
				char.innerHTML = "&nbsp;";
				this.cursor.x++;
				break;

			case "\x07":
				if (this.params.bell) this.Bell();
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

				if (this.bold)          char.style.fontWeight = "bold";
				if (this.faint)         char.style.opacity = "0.6";
				if (this.italic)        char.style.fontStyle = "italic";
				if (this.underline)     char.style.textDecoration = "underline";
				if (this.blinking)      char.style.animation = "terminal-blinking 1s infinite";
				if (this.fastBlinking)  char.style.animation = "terminal-fast-blinking .2s infinite";
				if (this.hidden)        char.style.visibility = "hidden";
				if (this.strikethrough) char.style.textDecoration = "line-through";

				this.cursor.x++;
				break;
			}

			this.lastCharacter = data[i];
		}

		this.cursorElement.style.left = Terminal.CURSOR_WIDTH * this.cursor.x + "px";
		this.cursorElement.style.top = Terminal.CURSOR_HEIGHT * this.cursor.y + "px";

		if (this.params.autoScroll) {
			setTimeout(()=>this.cursorElement.scrollIntoView(), 250);
		}
	}

	HandleEscSequence(data, index) { //Control Sequence Introducer
		if (index + 1 >= data.length) return 1;
		
		switch (data[index+1]) {
		case "[": return this.HandleCSI(data, index);
		case "P": return this.HandleDCS(data, index);
		case "]": return this.HandleOSC(data, index);
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
		const paramString  = match[2] || "";
		const command      = match[4];

		const params = paramString.split(";").map(param => {
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

		case "P":this.DeleteN(params[0] || 1); break;
		//case "S": break; //not ANSI
		//case "T": break; //not ANSI
		
		case "h": //show cursor
			switch (params[0]) {
			case 25: this.cursorElement.style.visibility = "visible"; break;
			case 1049: this.EnableAlternateScreen(); break;
			case 2004: this.bracketedMode = true; break;
			}
			break;

		case "l": //hide cursor
			switch (params[0]) {
			case 25: this.cursorElement.style.visibility = "hidden"; break;
			case 1049: this.DisableAlternateScreen(); break;
			case 2004: this.bracketedMode = false; break;
			}
			break;

		case "m": this.ParseGraphicsModes(params); break;

		case "s": //save cursor position
			this.savedCursorPos = {x:this.cursor.x, y:this.cursor.y};
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
				this.SetTitle(`Secure shell - ${this.params.host} - ${params.join(";")}`);
				break;
	
			case "10": //set foreground color
				break;
	
			case "11": //set background color
				break;
	
			default:
				console.warn(`Unhandled OSC command: ${command}`);
				break;
		}
	
		return end - index + 1;
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

	ParseGraphicsModes(params) {
		for (let i=0; i<params.length; i++) {
			switch (params[i]) {
			case 0: //reset all graphics modes
				this.foreColor       = null;
				this.backColor       = null;
				this.bold          = false;
				this.faint           = false;
				this.italic        = false;
				this.underline     = false;
				this.blinking      = false;
				this.fastBlinking  = false;
				this.inverse       = false;
				this.hidden        = false;
				this.strikethrough = false;
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

			default:
				console.warn(`Unknown graphics mode: ${params[0]}`);
			}
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
		const w = this.GetScreenWidth();
		const h = this.GetScreenHeight();
		const c = w * (this.cursor.y) + this.cursor.x;

		for (let y=0; y<h; y++) {
			for (let x=0; x<w; x++) {
				if (w*y + x <= c) continue;
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
		const c = w * (this.cursor.y) + this.cursor.x;

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
		//TODO: clear buffer
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