class Telnet extends Window {
	constructor(params) {
		super();

		this.params = params ? params : "";
		this.history = [];
		this.ws = null;
		this.last = null;

		let historyIndex = -1;

		this.SetTitle("Telnet");
		this.SetIcon("mono/telnet.svg");

		this.list = document.createElement("div");
		this.list.style.color = "#ccc";
		this.list.style.position = "absolute";
		this.list.style.overflowY = "auto";
		this.list.style.left = "0";
		this.list.style.right = "0";
		this.list.style.top = "0";
		this.list.style.bottom = "40px";
		this.list.style.margin = "8px 16px";
		this.list.style.fontFamily = "monospace";
		this.list.style.userSelect = "text";
		this.content.appendChild(this.list);

		this.inputBox = document.createElement("input");
		this.inputBox.type = "text";
		this.inputBox.style.position = "absolute";
		this.inputBox.style.left = "8px";
		this.inputBox.style.bottom = "8px";
		this.inputBox.style.width = "calc(100% - 16px)";
		this.inputBox.style.margin = "0";
		this.inputBox.style.border = "0";
		this.inputBox.style.boxSizing = "border-box";
		this.content.appendChild(this.inputBox);

		this.inputBox.onkeydown = event=> {
			if (event.code === "Enter") {
				this.Push(this.inputBox.value);
				this.list.scrollTop = this.list.scrollHeight;
				this.inputBox.value = "";
				event.preventDefault();
			}

			if (event.code === "ArrowUp" || event.code === "ArrowDown") {
				if (this.history.length == 0) return;

				if (event.code === "ArrowUp") historyIndex--; //up
				if (event.code === "ArrowDown") historyIndex++; //down

				if (historyIndex < 0) historyIndex = this.history.length - 1;
				historyIndex %= this.history.length;
				this.inputBox.value = this.history[historyIndex];

				event.preventDefault();
			}
			else if (event.code !== "ArrowLeft" && event.code !== "ArrowRight") { // not left nor rigth
				historyIndex = -1;
			}
		};


		this.defaultElement = this.inputBox;

		this.inputBox.onfocus = ()=>  this.BringToFront();
		this.escAction = ()=> { this.inputBox.value = ""; };

		this.ConnectDialog(this.params);
	}

	Close() { //override
		if (this.ws != null) this.ws.close();
		super.Close();
	}

	Push(command) { //override
		if (command.length === 0) command = "\n";

		if (command === "!!" && this.history.length === 0) return false;

		if (command === "!!") {
			this.Push(this.history[this.history.length - 1]);
			return false;
		}

		if (command.length > 0 && command !== "\r" && command !== "\n")
			this.history.push(command);

		this.PushLine();
		this.last.textContent = "> " + command;
		this.last.style.color = "#fff";
		this.PushLine();
		this.list.scrollTop = this.list.scrollHeight;

		if (this.ws != null && this.ws.readyState === 1) {//ready
			this.ws.send(command);

		}
		else {
			this.PushLine();
			this.last.textContent = "web socket error";
			this.last.style.color = "var(--theme-color)";
			this.PushLine();
			this.list.scrollTop = this.list.scrollHeight;
		}

		return true;
	}

	ConnectDialog(target = "") {
		const dialog = this.DialogBox("128px");
		if (dialog === null) return;

		const okButton = dialog.okButton;
		const cancelButton = dialog.cancelButton;
		const buttonBox = dialog.buttonBox;
		const innerBox = dialog.innerBox;

		innerBox.style.textAlign = "center";
		innerBox.style.padding = "20px 40px";

		okButton.value = "Connect";
		if (target.length === 0) okButton.setAttribute("disabled", true);

		const hostLabel = document.createElement("div");
		hostLabel.textContent = "Remote host:";
		hostLabel.style.display = "inline-block";
		hostLabel.style.minWidth = "100px";
		innerBox.appendChild(hostLabel);

		const hostInput = document.createElement("input");
		hostInput.type = "text";
		hostInput.value = target;
		hostInput.placeholder = "10.0.0.1:23";
		innerBox.appendChild(hostInput);

		setTimeout(()=> hostInput.focus(), 50);

		hostInput.oninput = hostInput.onchange = ()=> {
			if (hostInput.value.length === 0)
				okButton.setAttribute("disabled", true);
			else
				okButton.removeAttribute("disabled");
		};

		hostInput.onkeydown = event=> {
			if (hostInput.value.length === 0) return;
			if (event.code === "Enter") {
				this.Connect(hostInput.value);
				cancelButton.onclick();
			}
		};

		okButton.addEventListener("click", ()=> {
			this.Connect(hostInput.value);
		});

		cancelButton.addEventListener("click", ()=> this.Close());
	}

	Connect(target) {
		this.params = target;
		this.inputBox.focus();

		let server = window.location.href;
		server = server.replace("https://", "");
		server = server.replace("http://", "");
		if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

		if (this.ws != null) {
			try {
				this.ws.close();
			}
			catch {};
		}
		try {
			this.ws = new WebSocket((KEEP.isSecure ? "wss://" : "ws://") + server + "/ws/telnet");
		}
		catch {}

		this.PushLine();

		this.ws.onopen = ()=> {
			this.ws.send(target);
		};

		this.ws.onclose = ()=> {
			const error_message = this.PushLine();
			error_message.id = "self_destruct";
			error_message.textContent = "Connection is closed. Click to reconnect";
			error_message.style.color = "var(--clr-accent)";
			error_message.style.backgroundColor = "rgb(48,48,48)";
			error_message.style.cursor = "pointer";
			error_message.style.textAlign = "center";
			error_message.style.borderRadius = "4px";
			error_message.style.margin = "8px auto";
			error_message.style.padding = "8px";
			error_message.style.maxWidth = "320px";
			error_message.style.animation = "fade-in .4s 1";

			error_message.onclick = ()=> {
				error_message.onclick = ()=> {};
				error_message.style.cursor = "";
				error_message.textContent = "tcp connection has been terminated";
				this.list.appendChild(document.createElement("hr"));
				this.PushLine();
				this.Connect(target);
				this.list.scrollTop = this.list.scrollHeight;
			};
			this.list.scrollTop = this.list.scrollHeight;
		};

		let front     = "#ccc";
		let back      = "transparent";
		let bold      = false;
		let underline = false;

		this.ws.onmessage = event=> {
			let payload = event.data;
			let line = payload.split("\n");

			for (let i = 0; i < line.length; i++) {
				let s = line[i].indexOf(String.fromCharCode(27));

				if (s > 0) { //styled

					let split = line[i].split(String.fromCharCode(27)); //esc
					for (let j = 0; j < split.length; j++) {

						let          e = split[j].indexOf("m"); //ansi stop
						if (e == -1) e = split[j].indexOf("J"); //clear screen
						if (e == -1) e = split[j].indexOf("K"); //clear line

						if (e == -1) e = split[j].indexOf("A"); //move cursor |
						if (e == -1) e = split[j].indexOf("B"); //move cursor |
						if (e == -1) e = split[j].indexOf("C"); //move cursor |
						if (e == -1) e = split[j].indexOf("D"); //move cursor | cursor navigation
						if (e == -1) e = split[j].indexOf("E"); //move cursor | is not supported
						if (e == -1) e = split[j].indexOf("F"); //move cursor |
						if (e == -1) e = split[j].indexOf("G"); //move cursor |
						if (e == -1) e = split[j].indexOf("H"); //move cursor |

						if (e == -1) e = split[j].indexOf(" ");

						let ansi = split[j].substring(0, e+1);
						switch (ansi) {
						case "[0m":
							front = "#ccc";
							back = "transparent";
							bold = false;
							underline = false;
							break;

						case "[1m": bold = true; break;
						case "[4m": underline = true; break;

						case "[7m":
							front = "#222";
							back = "#ccc";
							break;

						case "[30m": front = "#000"; break;
						case "[31m": front = "#d00"; break;
						case "[32m": front = "#0d0"; break;
						case "[33m": front = "#0dd"; break;
						case "[34m": front = "#00d"; break;
						case "[35m": front = "#d0d"; break;
						case "[36m": front = "#0dd"; break;
						case "[37m": front = "#ddd"; break;

						case "[30;1m": front = "#222"; bold = true; break;
						case "[31;1m": front = "#f22"; bold = true; break;
						case "[32;1m": front = "#2f2"; bold = true; break;
						case "[33;1m": front = "#2ff"; bold = true; break;
						case "[34;1m": front = "#22f"; bold = true; break;
						case "[35;1m": front = "#f2f"; bold = true; break;
						case "[36;1m": front = "#2ff"; bold = true; break;
						case "[37;1m": front = "#fff"; bold = true; break;

						case "[40m": back = "#000"; break;
						case "[41m": back = "#d00"; break;
						case "[42m": back = "#0d0"; break;
						case "[43m": back = "#0dd"; break;
						case "[44m": back = "#00d"; break;
						case "[45m": back = "#d0d"; break;
						case "[46m": back = "#0dd"; break;
						case "[47m": back = "#ddd"; break;

						case "[40;1m": back = "#000"; bold = true; break;
						case "[41;1m": back = "#d00"; bold = true; break;
						case "[42;1m": back = "#0d0"; bold = true; break;
						case "[43;1m": back = "#0dd"; bold = true; break;
						case "[44;1m": back = "#00d"; bold = true; break;
						case "[45;1m": back = "#d0d"; bold = true; break;
						case "[46;1m": back = "#0dd"; bold = true; break;
						case "[47;1m": back = "#ddd"; bold = true; break;

						case "[0J": case "[1J": case "[2J":
							this.PushLine();
							this.last.style.height = this.content.clientHeight;
							this.PushLine();
							break;

						case "[0K": case "[1K": case "[2K":
							this.last.textContent = "";
							break;
						}

						this.PushText(split[j].replace(ansi, ""), front, back, bold, underline);
					}
				}
				else { //plain
					if (front == "#ccc" && back == "transparent")
						this.last.textContent += line[i];
					else
						this.PushText(line[i], front, back);
				}

				if (line[i].endsWith("\r")) {
					if (i == 0 && //negate echo
						this.history.length > 0 &&
						this.last.textContent.trim() === this.history[this.history.length - 1].trim()) {
						this.last.textContent = "";
					}
					else {
						this.PushLine();
					}
				}
			}

			this.list.scrollTop = this.list.scrollHeight;
		};

		//this.ws.onerror = error=> console.log(error);
	}

	PushText(text, front, back, bold = false, underline = false) {
		const div = document.createElement("div");
		div.style.display = "inline-block";
		if (front != "#ccc") div.style.color = front;
		if (back != "transparent") div.style.backgroundColor = back;
		if (bold) div.style.fontWeight = "600";
		if (underline) div.style.textDecoration = "underline";
		div.textContent = text;
		this.last.appendChild(div);
	}

	PushLine() {
		if (this.last && this.last.textContent.length == 0) return this.last;
		const div = document.createElement("div");
		this.list.appendChild(div);
		this.last = div;
		return div;
	}
}