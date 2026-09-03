"use strict";
class PtyHost extends Window {
	static CHAR_WIDTH = 8;
	static CHAR_HEIGHT = 18;
	static DEFAULT_SCROLLBACK = 1000;

	static PALETTE = {
		black:   "#111111",
		red:     "#de382b",
		green:   "#39b54a",
		yellow:  "#e1c706",

		blue:    "#3080d8",
		magenta: "#bc3fbc",
		cyan:    "#2cb5e9",
		white:   "#cccccc",

		brightBlack:   "#888888",
		brightRed:     "#ff0000",
		brightGreen:   "#00ff00",
		brightYellow:  "#ffff00",

		brightBlue:    "#0000ff",
		brightMagenta: "#ff00ff",
		brightCyan:    "#00ffff",
		brightWhite:   "#ffffff"
	};

	static SPECIAL_KEYS = {
		"Enter":"\r",
		"Tab":"\t",
		"Backspace":"\x7F",
		"Escape":"\x1b",
		"ArrowUp":"\x1b[A",
		"ArrowDown":"\x1b[B",
		"ArrowRight":"\x1b[C",
		"ArrowLeft":"\x1b[D",
		"Home":"\x1b[H",
		"End":"\x1b[F",
		"Insert":"\x1b[2~",
		"Delete":"\x1b[3~",
		"PageUp":"\x1b[5~",
		"PageDown":"\x1b[6~",
		"F1":"\x1bOP",
		"F2":"\x1bOQ",
		"F3":"\x1bOR",
		"F4":"\x1bOS",
		"F5":"\x1b[15~",
		"F6":"\x1b[17~",
		"F7":"\x1b[18~",
		"F8":"\x1b[19~",
		"F9":"\x1b[20~",
		"F10":"\x1b[21~",
		"F11":"\x1b[23~",
		"F12":"\x1b[24~"
	};

	static SHIFT_KEYS = {
		"F1":"\x1B[1;2P",
		"F2":"\x1B[1;2Q",
		"F3":"\x1B[1;2R",
		"F4":"\x1B[1;2S",
		"F5":"\x1B[15;2~",
		"F6":"\x1B[17;2~",
		"F7":"\x1B[18;2~",
		"F8":"\x1B[19;2~",
		"F9":"\x1B[20;2~",
		"F10":"\x1B[21;2~",
		"F11":"\x1B[23;2~",
		"F12":"\x1B[24;2~",
		"ArrowUp":"\x1B[1;2A",
		"ArrowDown":"\x1B[1;2B",
		"ArrowRight":"\x1B[1;2C",
		"ArrowLeft":"\x1B[1;2D",
		"Home":"\x1B[1;2H",
		"End":"\x1B[1;2F",
		"Insert":"\x1B[2;2~",
		"Delete":"\x1B[3;2~",
		"PageUp":"\x1B[5;2~",
		"PageDown":"\x1B[6;2~"
	};

	static CTRL_KEYS = {
		"KeyA":"\x01",
		"KeyB":"\x02",
		"KeyC":"\x03",
		"KeyD":"\x04",
		"KeyE":"\x05",
		"KeyF":"\x06",
		"KeyG":"\x07",
		"KeyH":"\x08",
		"KeyI":"\x09",
		"KeyJ":"\x0A",
		"KeyK":"\x0B",
		"KeyL":"\x0C",
		"KeyM":"\x0D",
		"KeyN":"\x0E",
		"KeyO":"\x0F",
		"KeyP":"\x10",
		"KeyQ":"\x11",
		"KeyR":"\x12",
		"KeyS":"\x13",
		"KeyT":"\x14",
		"KeyU":"\x15",
		"KeyV":"\x16",
		"KeyW":"\x17",
		"KeyX":"\x18",
		"KeyY":"\x19",
		"KeyZ":"\x1A",
		"Backspace":"\x08",
		"ArrowUp":"\x1B[1;5A",
		"ArrowDown":"\x1B[1;5B",
		"ArrowRight":"\x1B[1;5C",
		"ArrowLeft":"\x1B[1;5D",
		"Home":"\x1B[1;5H",
		"End":"\x1B[1;5F",
		"Delete":"\x1B[3;5~",
		"PageUp":"\x1B[5;5~",
		"PageDown":"\x1B[6;5~"
	};

	static ALT_KEYS = {
		"F1":"\x1B[1;3P",
		"F2":"\x1B[1;3Q",
		"F3":"\x1B[1;3R",
		"F4":"\x1B[1;3S",
		"ArrowUp":"\x1B[1;3A",
		"ArrowDown":"\x1B[1;3B",
		"ArrowRight":"\x1B[1;3C",
		"ArrowLeft":"\x1B[1;3D"
	};

	constructor(args) {
		super();

		this.args = Object.assign({
			darkMode: false,
			host: "",
			ansi: true,
			bell: false,
			scrollback: PtyHost.DEFAULT_SCROLLBACK
		}, args);

		this.AddCssDependencies("ptyhost.css");
		this.AddCssDependencies("xterm/xterm.css");

		this.term = null;
		this.fitAddon = null;
		this.minimapRafId = null;
		this.ws = null;

		this.resizeAware = false;
		this.resizeWs = null;
		this.lastSentCols = -1;
		this.lastSentRows = -1;

		this.InitializeComponents();
		this.InitializeTerminal();
	}

	AfterResize() { //overrides
		super.AfterResize();
		setTimeout(()=> {
			this.FitTerminal();
			this.ResizeMinimap();
		}, WIN.ANIME_DURATION);
	}

	PopOut() { //overrides
		const popInButton = super.PopOut();
		const popInButton_onclick = popInButton.onclick;

		this.minimap.style.top = "48px";
		popInButton.parentElement.parentElement.appendChild(this.minimap);

		popInButton.onclick = ()=> {
			popInButton_onclick();
			this.minimap.style.top = "var(--pty-content-top, 76px)";
			this.win.appendChild(this.minimap);
			popInButton.onclick = popInButton_onclick;
		};
	}

	InitializeComponents() {
		this.SetupToolbar();
		this.connectButton = this.AddToolbarButton("Connect", "mono/connect.svg?light");
		this.AddToolbarSeparator();

		this.darkModeButton = this.AddToolbarButton("Dark mode", "mono/darkmode.svg?light");
		this.bellSoundButton = this.AddToolbarButton("Bell sound", "mono/notifications.svg?light");
		this.optionsButton = this.AddToolbarButton("Options", "mono/wrench.svg?light");
		this.AddToolbarSeparator();

		this.sendKeyButton = this.AddToolbarButton("Send key", "mono/keyboard.svg?light");
		this.pasteButton = this.AddToolbarButton("Paste", "mono/clipboard.svg?light");

		this.darkModeButton.style.borderBottom = this.args.darkMode ? "3px solid rgb(192,192,192)" : "none";
		this.bellSoundButton.style.borderBottom = this.args.bell ? "3px solid rgb(192,192,192)" : "none";

		this.darkModeButton.style.display = "none";
		this.bellSoundButton.style.display = "none";

		this.defaultElement = this.content;

		this.win.style.containerType = "inline-size";

		this.content.classList.add("pty-content");
		this.win.style.colorScheme = this.args.darkMode ? "dark" : "inherit";

		this.cursorElement = document.createElement("div");
		this.cursorElement.className = "pty-cursor";
		this.cursorElement.style.display = "none";

		this.statusBox = document.createElement("div");
		this.statusBox.className = "pty-status-box";
		this.statusBox.textContent = "Connecting...";

		this.content.onclick = ()=> this.term?.focus();
		this.content.onfocus = ()=> { this.BringToFront(); this.term?.focus(); };

		this.connectButton.onclick    = ()=> this.ConnectDialog(this.args.host);
		this.darkModeButton.onclick   = ()=> this.ToggleDarkMode();
		this.bellSoundButton.onclick  = ()=> this.ToggleBell();
		this.optionsButton.onclick    = ()=> this.OptionsDialog();
		this.sendKeyButton.onclick    = ()=> this.CustomKeyDialog();
		this.pasteButton.onclick      = ()=> this.TextFromClipboard();

		this.minimap = document.createElement("div");
		this.minimap.className = "pty-minimap";

		this.minimapCanvas = document.createElement("canvas");
		this.minimapCanvas.className = "pty-minimap-canvas";

		this.minimapViewport = document.createElement("div");
		this.minimapViewport.className = "pty-minimap-viewport";

		this.minimap.appendChild(this.minimapCanvas);
		this.minimap.appendChild(this.minimapViewport);
		this.win.appendChild(this.minimap);

		const syncContentTop = ()=> this.win.style.setProperty("--pty-content-top", this.content.style.top || "76px");
		syncContentTop();
		new MutationObserver(syncContentTop).observe(this.content, { attributes:true, attributeFilter:["style"] });

		this.minimap.onmousedown = event=> {
			if (event.buttons !== 1) return;
			event.preventDefault();
			event.stopPropagation();
			this.MinimapSeek(event);

			const onMove = e=> {
				e.preventDefault();
				this.MinimapSeek(e);
			};

			const onUp = ()=> {
				document.removeEventListener("mousemove", onMove);
				document.removeEventListener("mouseup", onUp);
			};

			document.addEventListener("mousemove", onMove);
			document.addEventListener("mouseup", onUp);
		};

		this.minimap.onwheel = event=> {
			if (!this.term) return;
			this.term.scrollLines(Math.sign(event.deltaY) * 3);
		};
	}

	InitializeTerminal() {
		const TerminalCtor = window.Terminal;
		if (!TerminalCtor) {
			console.error("xterm.js is not loaded (window.Terminal is undefined).");
			return;
		}

		this.term = new TerminalCtor({
			fontFamily: "monospace",
			fontSize: 15,
			scrollback: this.GetScrollbackLimit(),
			cursorStyle: "bar",
			cursorBlink: true,
			convertEol: true,
			theme: this.BuildTheme()
		});

		const FitCtor = window.FitAddon && (window.FitAddon.FitAddon || window.FitAddon);
		if (FitCtor) {
			this.fitAddon = new FitCtor();
			this.term.loadAddon(this.fitAddon);
		}

		const LinksCtor = window.WebLinksAddon && (window.WebLinksAddon.WebLinksAddon || window.WebLinksAddon);
		if (LinksCtor) {
			this.term.loadAddon(new LinksCtor());
		}

		this.term.onData(data => this.SendToWs(data));
		this.term.onBinary(data => this.SendToWs(data));

		this.term.onBell(() => {
			if (this.args.bell) this.Bell();
		});

		this.term.onTitleChange(title => {
			if (this.args.host && this.args.host.length > 0) {
				this.SetTitle(`${this.args.host} - ${title}`);
			}
			else {
				this.SetTitle(title);
			}
		});

		this.term.onResize(() => {
			this.UpdateMinimap();
			this.SendResize();
		});
		this.term.onScroll(() => this.UpdateMinimap());
		this.term.onRender(() => this.UpdateMinimap());

		this.term.attachCustomKeyEventHandler(event => {
			if (event.ctrlKey && event.shiftKey && (event.code === "KeyC" || event.code === "KeyV")) {
				return false;
			}
			return true;
		});

		requestAnimationFrame(() => {
			if (!this.term) return;
			this.term.open(this.content);
			this.FitTerminal();
			this.ResizeMinimap();
			setTimeout(() => {
				this.FitTerminal();
				this.ResizeMinimap();
			}, WIN.ANIME_DURATION + 50);
		});
	}

	BuildTheme() {
		const accent = getComputedStyle(document.documentElement).getPropertyValue("--clr-accent").trim() || "#33bbff";
		const dark = this.args.darkMode;
		return Object.assign({
			background: dark ? "#1a1a1a" : "#ffffff",
			foreground: "light-dark(#202020, #e0e0e0)",
			cursor: accent,
			cursorAccent: dark ? "#1a1a1a" : "#ffffff",
			selectionBackground: "rgb(127,127,127)"
		}, PtyHost.PALETTE);
	}

	FitTerminal() {
		if (!this.term || !this.fitAddon) return;
		if (this.content.clientWidth === 0 || this.content.clientHeight === 0) return;
		try {
			this.fitAddon.fit();
		}
		catch (ex) {
			console.warn("xterm fit failed:", ex);
		}
		this.SendResize();
	}

	SendToWs(data) {
		if (!this.ws || this.ws.readyState !== 1) return;
		this.ws.send(data);
	}

	SendResize() {
		if (!this.resizeAware || !this.term) return;
		if (!this.ws || this.ws.readyState !== 1) return;

		if (this.ws !== this.resizeWs) {
			this.resizeWs = this.ws;
			this.lastSentCols = -1;
			this.lastSentRows = -1;
		}

		const cols = this.term.cols;
		const rows = this.term.rows;
		if (cols === this.lastSentCols && rows === this.lastSentRows) return;

		this.lastSentCols = cols;
		this.lastSentRows = rows;

		try {
			this.ws.send(JSON.stringify({cols, rows}));
		}
		catch {}
	}

	Close() { //overrides
		if (this.ws !== null) this.ws.close();
		if (this.term) {
			try { this.term.dispose(); } catch {}
			this.term = null;
		}
		super.Close();
	}

	ConnectDialog(target="", isNew=false) {} //overridable

	ToggleDarkMode() {
		this.args.darkMode = !this.args.darkMode;
		this.darkModeButton.style.borderBottom = this.args.darkMode ? "3px solid rgb(192,192,192)" : "none";
		this.win.style.colorScheme = this.args.darkMode ? "dark" : "inherit";
		if (this.term) this.term.options.theme = this.BuildTheme();
	}

	ToggleBell() {
		this.args.bell = !this.args.bell;
		this.bellSoundButton.style.borderBottom = this.args.bell ? "3px solid rgb(192,192,192)" : "none";
	}

	OptionsDialog() {
		const dialog = this.DialogBox("300px");
		if (dialog === null) return;

		const {okButton, innerBox} = dialog;

		innerBox.style.padding = "20px";
		innerBox.parentElement.style.maxWidth = "480px";
		innerBox.parentElement.parentElement.onclick = event=> { event.stopPropagation(); };

		const darkModeToggle = this.CreateToggle("Force dark mode", this.args.darkMode, innerBox);
		innerBox.appendChild(document.createElement("br"));
		innerBox.appendChild(document.createElement("br"));

		const bellToggle = this.CreateToggle("Play bell sound", this.args.bell, innerBox);
		innerBox.appendChild(document.createElement("br"));
		innerBox.appendChild(document.createElement("br"));

		const cursorBlinkToggle = this.CreateToggle("Blinking cursor", this.term ? this.term.options.cursorBlink : true, innerBox);
		innerBox.appendChild(document.createElement("br"));
		innerBox.appendChild(document.createElement("br"));

		const ansiToggle = this.CreateToggle("Escape ANSI codes", this.args.ansi, innerBox);
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

			this.args.darkMode = darkModeToggle.checkbox.checked;
			this.args.ansi = ansiToggle.checkbox.checked;
			this.args.bell = bellToggle.checkbox.checked;
			this.args.scrollback = Number.isNaN(scrollback) ? PtyHost.DEFAULT_SCROLLBACK : Math.max(0, scrollback);
			dialog.Close();

			this.win.style.colorScheme = this.args.darkMode ? "dark" : "inherit";

			if (this.term) {
				this.term.options.scrollback = this.args.scrollback;
				this.term.options.cursorBlink = cursorBlinkToggle.checkbox.checked;
				this.term.options.theme = this.BuildTheme();
			}

			this.darkModeButton.style.borderBottom = this.args.darkMode ? "3px solid rgb(192,192,192)" : "none";
			this.bellSoundButton.style.borderBottom = this.args.bell ? "3px solid rgb(192,192,192)" : "none";

			this.UpdateMinimap();
			this.term?.focus();
		};

		setTimeout(()=>darkModeToggle.label.focus(), 200);
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
				set = PtyHost.SHIFT_KEYS;
			}
			else if (ctrl.checkbox.checked) {
				set = PtyHost.CTRL_KEYS;
			}
			else if (alt.checkbox.checked) {
				set = PtyHost.ALT_KEYS;
			}
			else {
				set = PtyHost.SPECIAL_KEYS;
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
			this.SendToWs(keyInput.value);
			this.term?.focus();
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

		if (this.term) {
			this.term.paste(text);
			this.term.focus();
		}
	}

	HandleMessage(data) {
		if (!this.term || data.length === 0) return;

		this.SendResize();

		if (this.args.ansi) {
			this.term.write(data);
		}
		else {
			this.term.write(PtyHost.ToRawView(data));
		}
	}

	static ToRawView(data) {
		let out = "";
		for (const ch of data) {
			if (ch === "\n" || ch === "\r" || ch === "\t") {
				out += ch;
				continue;
			}

			const code = ch.charCodeAt(0);
			if (code < 0x20) {
				out += "^" + String.fromCharCode(code + 0x40);
			}
			else if (code === 0x7f) {
				out += "^?";
			}
			else {
				out += ch;
			}
		}
		return out;
	}

	GetScrollbackLimit() {
		const value = Number.parseInt(this.args.scrollback ?? this.args.historyLimit ?? PtyHost.DEFAULT_SCROLLBACK, 10);
		return Number.isNaN(value) ? PtyHost.DEFAULT_SCROLLBACK : Math.max(0, value);
	}

	ResizeMinimap() {
		const h = this.minimap.clientHeight;
		const w = this.minimap.clientWidth;
		if (h === 0 || w === 0) return;
		this.minimapCanvas.width  = w;
		this.minimapCanvas.height = h;
		this.DrawMinimap();
	}

	UpdateMinimap() {
		if (!this.minimapCanvas || this.minimapRafId) return;
		this.minimapRafId = requestAnimationFrame(()=> {
			this.minimapRafId = null;
			this.DrawMinimap();
		});
	}

	DrawMinimap() {
		const canvas = this.minimapCanvas;
		const cw = canvas.width;
		const ch = canvas.height;
		if (cw === 0 || ch === 0 || !this.term) return;

		const buffer = this.term.buffer.active;
		const rows = this.term.rows;
		const totalLines = Math.max(1, buffer.length);
		const totalMinimapH = totalLines * 2;
		const viewportTop = buffer.viewportY;
		const maxTop = Math.max(1, totalLines - rows);

		let minimapOffset = 0;
		if (totalMinimapH > ch) {
			const ratio = viewportTop / maxTop;
			minimapOffset = ratio * (totalMinimapH - ch);
		}

		const ctx = canvas.getContext("2d");
		const imageData = ctx.createImageData(cw, ch);
		const data = imageData.data;

		for (let i=0; i<data.length; i+=4) {
			data[i] = 96; data[i+1] = 96; data[i+2] = 96; data[i+3] = 255;
		}

		const firstLine = Math.max(0, Math.floor(minimapOffset / 2));
		const lastLine  = Math.min(totalLines - 1, firstLine + Math.ceil(ch / 2) + 1);
		const columns   = Math.min(this.term.cols, cw);

		for (let y=firstLine; y<=lastLine; y++) {
			const line = buffer.getLine(y);
			if (!line) continue;

			const text = line.translateToString(false);
			if (!text || text.trim().length === 0) continue;

			const py = Math.round(y * 2 - minimapOffset);

			for (let x=0; x<columns; x+=2) {
				const cell = line.getCell(x);
				if (!cell) continue;

				const chars = cell.getChars();
				const ink = chars.length > 0 && chars !== " ";

				const [r, g, b] = ink ? [216, 216, 216] : [96, 96, 96];

				for (let dy=0; dy<2; dy++) {
					const row = py + dy;
					if (row < 0 || row >= ch) continue;

					const idx = (row * cw + x) * 4;
					data[idx+0] = data[idx+4] = r;
					data[idx+1] = data[idx+5] = g;
					data[idx+2] = data[idx+6] = b;

					if (ink) {
						data[idx+3] = 255;
						data[idx+7] = 168;
					}
					else {
						data[idx+3] = 0;
						data[idx+7] = 0;
					}
				}
			}
		}

		ctx.putImageData(imageData, 0, 0);

		const sliderH   = this.GetMinimapSliderHeight();
		const sliderTop = Math.max(0, Math.min(ch - sliderH, Math.round(viewportTop * 2 - minimapOffset)));

		this.minimapViewport.style.top    = `${sliderTop}px`;
		this.minimapViewport.style.height = `${sliderH}px`;
	}

	GetMinimapSliderHeight() {
		if (!this.term) return 4;
		return Math.max(4, Math.round(this.term.rows * 2));
	}

	MinimapSeek(e) {
		if (!this.term) return;

		const rect = this.minimap.getBoundingClientRect();
		const sliderH = this.GetMinimapSliderHeight();
		const buffer = this.term.buffer.active;
		const rows = this.term.rows;
		const totalLines = Math.max(1, buffer.length);
		const maxTop = Math.max(0, totalLines - rows);
		const totalMinimapH = totalLines * 2;

		const sliderTop = e.clientY - rect.top - sliderH / 2;

		let targetTop;
		if (totalMinimapH <= rect.height) {
			targetTop = Math.round(sliderTop / 2);
		}
		else {
			const ratio = sliderTop / Math.max(1, rect.height - sliderH);
			targetTop = Math.round(ratio * maxTop);
		}

		this.term.scrollToLine(Math.min(maxTop, Math.max(0, targetTop)));
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
