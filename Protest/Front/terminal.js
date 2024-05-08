class Terminal extends Window {
	constructor(params) {
		super();

		this.params = params ? params : "";
		this.ws = null;

		this.SetTitle("Terminal");
		this.SetIcon("mono/console.svg");

		this.AddCssDependencies("terminal.css");

		this.SetupToolbar();
		this.connectButton = this.AddToolbarButton("Connect", "mono/connect.svg?light");
		this.settingsButton = this.AddToolbarButton("Settings", "mono/wrench.svg?light");
		this.AddToolbarSeparator();

		this.connectButton.disabled = true;

		this.content.tabIndex = 1;
		this.content.classList.add("terminal-content");

		const cursor = document.createElement("div");
		cursor.className = "terminal-cursor";
		this.content.appendChild(cursor);

		this.win.onclick = () => this.content.focus();
		this.content.onfocus = () => this.BringToFront();
		this.content.onkeydown = event => this.Terminal_onkeydown(event);

		//TODO:
		this.Connect("telehack.com:23");
	}

	Close() { //overrides
		if (this.ws != null) this.ws.close();
		super.Close();
	}

	AfterResize() { //overrides
		super.AfterResize();
		//TODO:
	}

	Connect(target) {
		this.params = target;
		
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

		this.ws.onopen = ()=> this.ws.send(target);
		
		this.ws.onclose = ()=> {
			//TODO:
		};

		this.ws.onmessage = event=> {
			console.log(event.data)
			this.HandleMessage(event.data);
		};

		//this.connectButton.disabled = true;
	}

	Terminal_onkeydown(event) {
		event.preventDefault();
		console.log(event.key, event.ctrlKey, event.altKey, event.shiftKey);
	
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
		case "ArrowLeft" : this.ws.send("\x1b[D"); break;
		case "ArrowRight": this.ws.send("\x1b[C"); break;
		case "ArrowUp"   : this.ws.send("\x1b[A"); break;
		case "ArrowDown" : this.ws.send("\x1b[B"); break;
		//default: this.ws.send("\x1b[2J"); return; //
		}
	}

	HandleMessage(data) {
		switch (data) {
		case "\x07": this.Beep(); break; //bell

		//TODO:
		case "\x08": //backspace
		case "\x09": //tab
		case "\x0a": //lf
		case "\x0b": //vertical tab
		case "\x0c": //new page
		case "\x0d": //cr
		case "\x7F": //delete
		}
	}

	Beep() {
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