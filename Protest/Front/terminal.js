class Terminal extends Window {
	static CURSOR_WIDTH = 8;
	static CURSOR_HEIGHT = 18;

	constructor(params) {
		super();

		this.params = params ? params : {host:"", isAnsi:true, bell:true};

		this.cursor    = {x:0, y:0};
		this.chars     = {};
		this.backColor = null;
		this.foreColor = null;
		this.isBold    = false;
		this.isItalic  = false;

		this.savedCursorPos = null;
		this.savedLine      = null;
		this.savedScreen    = null;

		this.ws = null;

		this.SetTitle("Terminal");
		this.SetIcon("mono/console.svg");

		this.AddCssDependencies("terminal.css");

		this.SetupToolbar();
		this.connectButton = this.AddToolbarButton("Connect", "mono/connect.svg?light");
		this.optionsButton = this.AddToolbarButton("Options", "mono/wrench.svg?light");
		this.AddToolbarSeparator();
		this.sendKeyButton = this.AddToolbarButton("Send key", "mono/keyboard.svg?light");
		this.pasteButton = this.AddToolbarButton("Paste", "mono/clipboard.svg?light");

		this.content.tabIndex = 1;
		this.content.classList.add("terminal-content");

		this.cursorElement = document.createElement("div");
		this.cursorElement.className = "terminal-cursor";
		this.content.appendChild(this.cursorElement);

		this.win.onclick = ()=> this.content.focus();
		this.content.onfocus = ()=> this.BringToFront();
		this.content.onkeydown = event=> this.Terminal_onkeydown(event);

		this.connectButton.onclick = ()=> this.ConnectDialog(this.params.host);
		this.optionsButton.onclick = ()=> this.OptionsDialog();
		this.sendKeyButton.onclick = ()=> this.CustomKeyDialog();
		this.pasteButton.onclick = ()=> this.ClipboardDialog();

		if (this.params.host.length > 0) {
			this.ConnectDialog(this.params.host, true);
		}
	}

	Close() { //overrides
		if (this.ws != null) this.ws.close();
		super.Close();
	}

	AfterResize() { //overrides
		super.AfterResize();
		//TODO:
	}

	ConnectDialog(target="", isNew=false) {
		const dialog = this.DialogBox("112px");
		if (dialog === null) return;

		const okButton = dialog.okButton;
		const cancelButton = dialog.cancelButton;
		const innerBox = dialog.innerBox;

		innerBox.parentElement.style.maxWidth = "400px";
		innerBox.parentElement.parentElement.onclick = event=> { event.stopPropagation(); };

		innerBox.style.margin = "20px 8px 0 8px";
		innerBox.style.textAlign = "center";

		const hostLabel = document.createElement("div");
		hostLabel.style.display = "inline-block";
		hostLabel.style.minWidth = "50px";
		hostLabel.textContent = "Host:";

		const hostInput = document.createElement("input");
		hostInput.type = "text";
		hostInput.style.width = "calc(100% - 72px)";
		hostInput.value = target;

		innerBox.append(hostLabel, hostInput);

		okButton.onclick = ()=> {
			dialog.Close();
			this.Connect(hostInput.value);
		};
		
		if (isNew) {
			cancelButton.value = "Close";

			cancelButton.onclick = ()=> {
				dialog.Close();
				this.Close();
			};
		}

		hostInput.onkeydown = event=> {
			if (event.key === "Enter") {
				dialog.okButton.click();
			}
		};

		setTimeout(()=> hostInput.focus(), 200);
	}

	OptionsDialog() {
		const dialog = this.DialogBox("168px");
		if (dialog === null) return;

		const okButton = dialog.okButton;
		const cancelButton = dialog.cancelButton;
		const innerBox = dialog.innerBox;

		innerBox.style.padding = "20px";
		innerBox.parentElement.style.maxWidth = "480px";
		innerBox.parentElement.parentElement.onclick = event=> { event.stopPropagation(); };

		const ansiCheckbox = document.createElement("input");
		ansiCheckbox.type = "checkbox";
		ansiCheckbox.checked = this.params.isAnsi;
		innerBox.appendChild(ansiCheckbox);
		this.AddCheckBoxLabel(innerBox, ansiCheckbox, "Escape ANSI codes");

		innerBox.appendChild(document.createElement("br"));
		innerBox.appendChild(document.createElement("br"));

		const bellCheckbox = document.createElement("input");
		bellCheckbox.type = "checkbox";
		bellCheckbox.checked = this.params.bell;
		innerBox.appendChild(bellCheckbox);
		this.AddCheckBoxLabel(innerBox, bellCheckbox, "Play bell sound");

		okButton.onclick = ()=> {
			this.params.isAnsi = ansiCheckbox.checked;
			this.params.bell = bellCheckbox.checked;
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
		const dialog = this.DialogBox("320px");
		if (dialog === null) return;

		const okButton = dialog.okButton;
		const innerBox = dialog.innerBox;

		okButton.value = "Paste";
		okButton.disabled = true;

		innerBox.style.padding = "20px";
		innerBox.parentElement.style.maxWidth = "560px";
		innerBox.parentElement.parentElement.onclick = event=> { event.stopPropagation(); };

		const keyText = document.createElement("textarea");
		keyText.style.width = "calc(100% - 8px)";
		keyText.style.height = "calc(100% - 8px)";
		keyText.style.boxSizing = "border-box";
		keyText.style.resize = "none";
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
			console.log(keyText.value);
			//TODO: Send key
		};

		setTimeout(()=>{ keyText.focus(); }, 200);
	}

	Connect(target) {
		this.params.host = target;
		
		let server = window.location.href;
		server = server.replace("https://", "");
		server = server.replace("http://", "");
		if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

		if (this.ws != null) {
			try {
				this.ws.close();
			}
			catch {}
		}

		try {
			this.ws = new WebSocket((KEEP.isSecure ? "wss://" : "ws://") + server + "/ws/telnet2");
		}
		catch {}

		this.ws.onopen = ()=> {
			this.connectButton.disabled = true;
			this.ws.send(target);
		};

		this.ws.onclose = ()=> {
			this.connectButton.disabled = false;
		};

		this.ws.onmessage = event=> {
			this.HandleMessage(event.data);
		};
	}

	Terminal_onkeydown(event) {
		event.preventDefault();
		//console.log(event.key, event.ctrlKey, event.altKey, event.shiftKey);
	
		if (this.ws === null || this.ws.readyState != 1) {
			return;
		}

		if (event.key.length === 1) {
			this.ws.send(event.key);
			return;
		}

		switch(event.key) {
		case "Enter"     : this.ws.send("\n\r"); break;
		case "Tab"       : this.ws.send("\t"); break;
		case "Backspace" : this.ws.send("\x08"); break;
		case "Delete"    : this.ws.send("\x1b[3~"); break;
		case "ArrowLeft" : this.ws.send("\x1b[D"); break;
		case "ArrowRight": this.ws.send("\x1b[C"); break;
		case "ArrowUp"   : this.ws.send("\x1b[A"); break;
		case "ArrowDown" : this.ws.send("\x1b[B"); break;
		case "PageUp"    : this.ws.send(`\x1b[${this.GetScreenHeight()-1}A`); break;
		case "PageDown"  : this.ws.send(`\x1b[${this.GetScreenHeight()-1}B`); break;

		//default: this.ws.send("\x1b[2J"); return; //erase entire screen
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

			case "\x07": if (this.params.bell) { this.Bell(); } break;

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
			//case "\x0c": break; //new page
			//case "\x0d": break; //cr

			case "\x1b": //esc
				if (this.params.isAnsi) {
					i += this.HandleEscSequence(data, i) - 1;
				}
				else {
					char.textContent = data[i];
				}
				
				break;

			//case "\x7f": break; //delete

			default:
				char.textContent = data[i];
				this.cursor.x++;
				break;
			}
		}

		this.cursorElement.style.left = Terminal.CURSOR_WIDTH * this.cursor.x + "px";
		this.cursorElement.style.top = Terminal.CURSOR_HEIGHT * this.cursor.y + "px";
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
		
		if (!isNaN(data[index+2])) {
			let i = index + 2;
			let n = parseInt(data[i]);
			while (!isNaN(data[++i]) && i < data.length) {
				n *= 10;
				n += parseInt(data[i]);
			}

			if (data[i] === "A") { //cursor up
				this.cursor.y = Math.max(0, this.cursor.y - n);
			}
			else if (data[i] === "B") { //cursor down
				this.cursor.y += n;
			}
			else if (data[i] === "C") { //cursor right
				this.cursor.x += n;
			}
			else if (data[i] === "D") { //cursor left
				this.cursor.x = Math.max(0, this.cursor.x - n);
			}
			else if (data[i] === "E") { //cursor to beginning of next line, n lines down
				this.cursor.x = 0;
				this.cursor.y += n;
			}
			else if (data[i] === "F") { //cursor to beginning of previous line, n lines up
				this.cursor.x = 0;
				this.cursor.y = Math.max(0, this.cursor.y - n);
			}
			else if (data[i] === "G") { //moves cursor to column n
				this.cursor.x = n;
			}
			else if (data[i] === "P") { //delete n chars and shift the following chars left
				let i = this.cursor.x+n;
				let sequence = "";
				while (this.chars[`${i++},${this.cursor.y}`]) {
					sequence += this.chars[`${i-1},${this.cursor.y}`].textContent;
				}

				i = this.cursor.x;
				let key = `${i},${this.cursor.y}`;
				while (this.chars[key]) {
					this.content.removeChild(this.chars[key]);
					delete this.chars[key];

					key = `${++i},${this.cursor.y}`;
				}

				for (i=0; i<sequence.length; i++) {
					const char = document.createElement("span");
					char.style.left = `${(this.cursor.x + i) * Terminal.CURSOR_WIDTH}px`;
					char.style.top = `${this.cursor.y * Terminal.CURSOR_HEIGHT}px`;
					this.content.appendChild(char);
					this.chars[`${this.cursor.x + i},${this.cursor.y}`] = char;
				}
			}
			else if (data[i] === "J") { //erase screen
				if (n === 0) { //erase from cursor until end
					console.warn(`Unknown CSI: 0J`);
					return 4;
				}
				else if (n === 1) { //erase from cursor to beginning of screen
					console.warn(`Unknown CSI: 1J`);
					return 4;
				}
				else if (n === 2) { //clear entire screen
					this.ClearScreen();
					return 4;
				}
				else if (n === 3) { //erase saved lines
					console.warn(`Unknown CSI: 3J`);
					return 4;
				}
			}
			else {
				console.warn(`Unknown CSI: ${n}${data[i]}`);
			}

			return i - index + 1;
		}

		if (data[index+2] === "H") { //cursor to home position (0,0)
			this.cursor.x = 0;
			this.cursor.y = 0;
			return 3;
		}

		if (data[index+2] === "K") {
			this.ClearLineFromCursorToEnd();
			return 3;
		}

		console.warn("Unknown CSI: " + data[index+2]);
		return 2;
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

	ClearLine() {
		const w = this.GetScreenWidth();
		for (let i=0; i<w; i++) {
			const key = `${i},${this.cursor.y}`;
			if (!this.chars[key]) continue;
			this.content.removeChild(this.chars[key]);
			delete this.chars[key];
		}

		//this.cursor = {x:0, y:this.cursor.y};
	}

	ClearLineFromCursorToEnd() {
		const w = this.GetScreenWidth();
		for (let i=this.cursor.x; i<w; i++) {
			const key = `${i},${this.cursor.y}`;
			if (!this.chars[key]) continue;

			this.content.removeChild(this.chars[key]);
			delete this.chars[key];
		}
	}

	ClearScreen() {
		this.chars = {};
		this.content.innerHTML = "";
		this.content.appendChild(this.cursorElement);
		//this.cursor = {x:0, y:0};
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
		oscillator.frequency.value = 290;

		let gain = ctx.createGain();
		gain.gain.value = .4;

		oscillator.connect(gain);
		gain.connect(ctx.destination);

		oscillator.start();
		setTimeout(()=>{ oscillator.stop() }, 150);
	}
}