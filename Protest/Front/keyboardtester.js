class KeyboardTester extends Window {
	constructor(params) {
		super();

		this.params = params;

		this.win.tabIndex = "0";
		this.win.style.outline = "0";

		this.content.style.overflow = "scroll";

		this.defaultElement = this.win;

		this.isGamePadListening = false;

		if (this.params === "gamepad") {
			this.SetTitle("Gamepad tester");
			this.SetIcon("mono/gamepad.svg");

			this.InitializeGamepad(true);
			return;
		}

		this.SetTitle("Keyboard tester");
		this.SetIcon("mono/keyboard.svg");
		
		this.InitializeKeyboard();
		this.InitializeGamepad();

		const history = document.createElement("div");
		history.style.position = "relative";
		history.style.overflow = "hidden";
		history.style.width = "100%";
		history.style.height = "28px";
		this.content.appendChild(history);

		this.history = document.createElement("div");
		this.history.style.position = "absolute";
		this.history.style.right = "8px";
		this.history.style.height = "28px";
		this.history.style.overflow = "hidden";
		history.appendChild(this.history);

		setTimeout(()=>{this.win.focus()}, WIN.ANIME_DURATION);
	}

	InitializeKeyboard() {
		const main = document.createElement("div");
		main.style.float = "left";
		main.style.width = "680px";
		main.style.height = "280px";
		main.style.marginLeft = "20px";
		main.style.marginTop = "20px";

		const arrows = document.createElement("div");
		arrows.style.float = "left";
		arrows.style.width = "140px";
		arrows.style.height = "280px";
		arrows.style.marginLeft = "20px";
		arrows.style.marginTop = "20px";

		const num = document.createElement("div");
		num.style.float = "left";
		num.style.width = "180px";
		num.style.height = "280px";
		num.style.marginLeft = "20px";
		num.style.marginTop = "20px";

		this.content.append(main, arrows, num);

		const rows = [];
		const rows2 = [];
		const rows3 = [];
		this.keyText = {};
		this.keyElements = {};
		this.led = {};

		for (let i = 0; i < 6; i++) {
			const row = document.createElement("div");
			row.style.height = "44px";
			row.style.maxHeight = "64px";
			rows.push(row);
			main.appendChild(row);
		}

		for (let i = 0; i < 6; i++) {
			const row = document.createElement("div");
			row.style.height = "44px";
			row.style.maxHeight = "64px";
			rows2.push(row);
			arrows.appendChild(row);
		}

		for (let i = 0; i < 6; i++) {
			const row = document.createElement("div");
			row.style.height = "44px";
			row.style.maxHeight = "64px";
			rows3.push(row);
			num.appendChild(row);
		}

		rows[0].style.transform = "scaleY(.8)";
		rows2[0].style.transform = "scaleY(.8)";
		rows3[0].style.transform = "scaleY(.8)";

		const rowA = [
			{code:"Escape", text:"Esc"},
			{code:"F1",  text:"F1"},
			{code:"F2",  text:"F2"},
			{code:"F3",  text:"F3"},
			{code:"F4",  text:"F4"},
			{code:"F5",  text:"F5"},
			{code:"F6",  text:"F6"},
			{code:"F7",  text:"F7"},
			{code:"F8",  text:"F8"},
			{code:"F9",  text:"F9"},
			{code:"F10", text:"F10"},
			{code:"F11", text:"F11"},
			{code:"F12", text:"F12"}
		];
		const rowB = [
			{code:"Backquote", text:"`"},
			{code:"Digit1", text:"1"},
			{code:"Digit2", text:"2"},
			{code:"Digit3", text:"3"},
			{code:"Digit4", text:"4"},
			{code:"Digit5", text:"5"},
			{code:"Digit6", text:"6"},
			{code:"Digit7", text:"7"},
			{code:"Digit8", text:"8"},
			{code:"Digit9", text:"9"},
			{code:"Digit0", text:"0"},
			{code:"Minus", text:"-"},
			{code:"Equal", text:"="},
			{code:"Backspace", text:"Backspace"}
		];
		const rowC = [
			{code:"Tab", text:"Tab"},
			{code:"KeyQ", text:"Q"},
			{code:"KeyW", text:"W"},
			{code:"KeyE", text:"E"},
			{code:"KeyR", text:"R"},
			{code:"KeyT", text:"T"},
			{code:"KeyY", text:"Y"},
			{code:"KeyU", text:"U"},
			{code:"KeyI", text:"I"},
			{code:"KeyO", text:"O"},
			{code:"KeyP", text:"P"},
			{code:"BracketLeft", text:"["},
			{code:"BracketRight", text:"]"},
			{code:"Backslash", text:"\\"}
		];
		const rowD = [
			{code:"CapsLock", text:"Caps"},
			{code:"KeyA", text:"A"},
			{code:"KeyS", text:"S"},
			{code:"KeyD", text:"D"},
			{code:"KeyF", text:"F"},
			{code:"KeyG", text:"G"},
			{code:"KeyH", text:"H"},
			{code:"KeyJ", text:"J"},
			{code:"KeyK", text:"K"},
			{code:"KeyL", text:"L"},
			{code:"Semicolon", text:";"},
			{code:"Quote", text:"'"},
			{code:"Enter", text:"Enter"}
		];
		const rowE = [
			{code:"ShiftLeft", text:"Shift"},
			{code:"KeyZ", text:"Z"},
			{code:"KeyX", text:"X"},
			{code:"KeyC", text:"C"},
			{code:"KeyV", text:"V"},
			{code:"KeyB", text:"B"},
			{code:"KeyN", text:"N"},
			{code:"KeyM", text:"M"},
			{code:"Comma", text:","},
			{code:"Period", text:"."},
			{code:"Slash", text:"/"},
			{code:"ShiftRight", text:"Shift"}
		];
		const rowF = [
			{code:"ControlLeft", text:"Ctrl"},
			{code:"OSLeft", text:"OS"},
			{code:"AltLeft", text:"Alt"},
			{code:"Space", text:"Space"},
			{code:"AltRight", text:"Alt"},
			{code:"OSRight", text:"OS"},
			{code:"ContextMenu", text:"Menu"},
			{code:"ControlRight", text:"Ctrl"}
		];

		const row2A = [
			{code:"PrintScreen", text:"PS"},
			{code:"ScrollLock", text:"SL"},
			{code:"Pause", text:"PB"}
		];
		const row2B = [
			{code:"Insert", text:"Ins"},
			{code:"Home", text:"Home"},
			{code:"PageUp", text:"Up"}
		];
		const row2C = [
			{code:"Delete", text:"Del"},
			{code:"End", text:"End"},
			{code:"PageDown", text:"Down"}
		];
		const row2D = [];
		const row2E = [
			{code:"ArrowUp", text:String.fromCharCode(9650)}
		];
		const row2F = [
			{code:"ArrowLeft", text:String.fromCharCode(9664)},
			{code:"ArrowDown", text:String.fromCharCode(9660)},
			{code:"ArrowRight", text:String.fromCharCode(9654)}
		];

		const row3A = [
			{code:"MediaStop",          text:String.fromCharCode(0x23F9)},
			{code:"MediaTrackPrevious", text:String.fromCharCode(0x23EE)},
			{code:"MediaPlayPause",     text:String.fromCharCode(0x23EF)},
			{code:"MediaTrackNext",     text:String.fromCharCode(0x23ED)},
			//{code:"VolumeMute",         text:""},
			//{code:"VolumeDown",         text:""},
			//{code:"VolumeUp",           text:""}
		];
		const row3B = [
			{code:"NumLock", text:"Num"},
			{code:"NumpadDivide", text:"/"},
			{code:"NumpadMultiply", text:"*"},
			{code:"NumpadSubtract", text:"-"}
		];
		const row3C = [
			{code:"Numpad7", text:"7"},
			{code:"Numpad8", text:"8"},
			{code:"Numpad9", text:"9"},
			{code:"NumpadAdd", text:"+"}
		];
		const row3D = [
			{code:"Numpad4", text:"4"},
			{code:"Numpad5", text:"5"},
			{code:"Numpad6", text:"6"}
		];
		const row3E = [
			{code:"Numpad1", text:"1"},
			{code:"Numpad2", text:"2"},
			{code:"Numpad3", text:"3"},
			{code:"NumpadEnter", text:String.fromCharCode(8629)}
		];
		const row3F = [
			{code:"Numpad0", text:"0"},
			{code:"NumpadDecimal", text:"."}
		];
		
		rowA.forEach(key=>this.CreateKey(key, rows[0]));
		rowB.forEach(key=>this.CreateKey(key, rows[1]));
		rowC.forEach(key=>this.CreateKey(key, rows[2]));
		rowD.forEach(key=>this.CreateKey(key, rows[3]));
		rowE.forEach(key=>this.CreateKey(key, rows[4]));
		rowF.forEach(key=>this.CreateKey(key, rows[5]));

		row2A.forEach(key=>this.CreateKey(key, rows2[0]));
		row2B.forEach(key=>this.CreateKey(key, rows2[1]));
		row2C.forEach(key=>this.CreateKey(key, rows2[2]));
		row2D.forEach(key=>this.CreateKey(key, rows2[3]));
		row2E.forEach(key=>this.CreateKey(key, rows2[4]));
		row2F.forEach(key=>this.CreateKey(key, rows2[5]));

		row3A.forEach(key=>this.CreateKey(key, rows3[0], true));
		row3B.forEach(key=>this.CreateKey(key, rows3[1]));
		row3C.forEach(key=>this.CreateKey(key, rows3[2]));
		row3D.forEach(key=>this.CreateKey(key, rows3[3]));
		row3E.forEach(key=>this.CreateKey(key, rows3[4]));
		row3F.forEach(key=>this.CreateKey(key, rows3[5]));
	
		this.win.oncontextmenu = event=> {
			event.preventDefault();
		};

		this.win.onkeydown = event=> {
			event.preventDefault();
			this.PushHistory(event.code);

			if (!this.keyElements.hasOwnProperty(event.code)) return;
			this.keyElements[event.code].style.color = "#000";
			this.keyElements[event.code].style.backgroundColor = "var(--clr-accent)";
			this.keyElements[event.code].style.filter = "brightness(2.5)";
			this.keyElements[event.code].style.boxShadow = "var(--clr-accent) 0 0 4px";
		};

		this.win.onkeyup = event=> {
			event.preventDefault();

			if (event.key === "PrintScreen") {
				this.PushHistory(event.code);
				this.keyElements["PrintScreen"].style.color = "#000";
				this.keyElements["PrintScreen"].style.backgroundColor = "var(--clr-accent)";
			}

			if (!this.keyElements.hasOwnProperty(event.code)) return;
			this.keyElements[event.code].style.filter = "none";
			this.keyElements[event.code].style.boxShadow = "none";

			this.CheckLed(event);
		};
		
	}

	InitializeGamepad(forced = false) {
		this.gamepad = document.createElement("div");
		this.gamepad.style.float = "left";
		this.gamepad.style.width = "420px";
		this.gamepad.style.height = "280px";
		this.gamepad.style.marginLeft = "20px";
		this.gamepad.style.marginTop = "20px";
		this.gamepad.style.display = forced ? "initial" : "none";
		this.content.appendChild(this.gamepad);

		if (forced) {
			this.gamepad.style.transformOrigin = "0 0";
			this.gamepad.style.transform = "scale(1.5)";
		}

		const frame = document.createElement("div");
		frame.style.position = "absolute";
		frame.style.marginTop = "25px";
		frame.style.width = "420px";
		frame.style.height = "180px";
		frame.style.perspective = "800px";
		this.gamepad.appendChild(frame);

		this.gpLeftButton = document.createElement("div");
		this.gpLeftButton.style.position = "absolute";
		this.gpLeftButton.style.left = "78px";
		this.gpLeftButton.style.top = "-10px";
		this.gpLeftButton.style.width = "48px";
		this.gpLeftButton.style.height = "10px";
		this.gpLeftButton.style.backgroundColor = "rgba(16,16,16,0.2)";
		this.gpLeftButton.style.border = "1.5px solid var(--clr-light)";
		this.gpLeftButton.style.borderRadius = "8px 2px 0px 0px";
		this.gpLeftButton.style.boxSizing = "border-box";
		this.gpLeftButton.style.transformOrigin = "50% 100%";
		
		this.gpRightButton = document.createElement("div");
		this.gpRightButton.style.position = "absolute";
		this.gpRightButton.style.left = "294px";
		this.gpRightButton.style.top = "-10px";
		this.gpRightButton.style.width = "48px";
		this.gpRightButton.style.height = "10px";
		this.gpRightButton.style.backgroundColor = "rgba(16,16,16,0.2)";
		this.gpRightButton.style.border = "1.5px solid var(--clr-light)";
		this.gpRightButton.style.borderRadius = "2px 8px 0px 0px";
		this.gpRightButton.style.boxSizing = "border-box";
		this.gpRightButton.style.transformOrigin = "50% 100%";

		this.gpLeftTrigger = document.createElement("div");
		this.gpLeftTrigger.style.position = "absolute";
		this.gpLeftTrigger.style.left = "94px";
		this.gpLeftTrigger.style.top = "-32px";
		this.gpLeftTrigger.style.width = "32px";
		this.gpLeftTrigger.style.height = "20px";
		this.gpLeftTrigger.style.backgroundColor = "rgba(16,16,16,0.2)";
		this.gpLeftTrigger.style.border = "1.5px solid var(--clr-light)";
		this.gpLeftTrigger.style.borderRadius = "12px 12px 0px 0px";
		this.gpLeftTrigger.style.boxSizing = "border-box";
		this.gpLeftTrigger.style.transformOrigin = "50% 100%";
		
		this.gpRightTrigger = document.createElement("div");
		this.gpRightTrigger.style.position = "absolute";
		this.gpRightTrigger.style.left = "294px";
		this.gpRightTrigger.style.top = "-32px";
		this.gpRightTrigger.style.width = "32px";
		this.gpRightTrigger.style.height = "20px";
		this.gpRightTrigger.style.backgroundColor = "rgba(16,16,16,0.2)";
		this.gpRightTrigger.style.border = "1.5px solid var(--clr-light)";
		this.gpRightTrigger.style.borderRadius = "12px 12px 0px 0px";
		this.gpRightTrigger.style.boxSizing = "border-box";
		this.gpRightTrigger.style.transformOrigin = "50% 100%";

		frame.append(this.gpLeftButton, this.gpRightButton, this.gpLeftTrigger, this.gpRightTrigger);


		this.gpDLeft = document.createElement("div");
		this.gpDLeft.style.position = "absolute";
		this.gpDLeft.style.left = "35px";
		this.gpDLeft.style.top = "65px";
		this.gpDLeft.style.width = "25px";
		this.gpDLeft.style.height = "20px";
		this.gpDLeft.style.backgroundColor = "rgba(16,16,16,0.2)";
		this.gpDLeft.style.border = "1.5px solid var(--clr-light)";
		this.gpDLeft.style.borderRadius = "2px 6px 6px 2px";
		this.gpDLeft.style.boxSizing = "border-box";

		this.gpDRight = document.createElement("div");
		this.gpDRight.style.position = "absolute";
		this.gpDRight.style.left = "80px";
		this.gpDRight.style.top = "65px";
		this.gpDRight.style.width = "25px";
		this.gpDRight.style.height = "20px";
		this.gpDRight.style.backgroundColor = "rgba(16,16,16,0.2)";
		this.gpDRight.style.border = "1.5px solid var(--clr-light)";
		this.gpDRight.style.borderRadius = "6px 2px 2px 6px";
		this.gpDRight.style.boxSizing = "border-box";
		
		this.gpDUp = document.createElement("div");
		this.gpDUp.style.position = "absolute";
		this.gpDUp.style.left = "60px";
		this.gpDUp.style.top = "40px";
		this.gpDUp.style.width = "20px";
		this.gpDUp.style.height = "25px";
		this.gpDUp.style.backgroundColor = "rgba(16,16,16,0.2)";
		this.gpDUp.style.border = "1.5px solid var(--clr-light)";
		this.gpDUp.style.borderRadius = "2px 2px 6px 6px";
		this.gpDUp.style.boxSizing = "border-box";

		this.gpDDown = document.createElement("div");
		this.gpDDown.style.position = "absolute";
		this.gpDDown.style.left = "60px";
		this.gpDDown.style.top = "85px";
		this.gpDDown.style.width = "20px";
		this.gpDDown.style.height = "25px";
		this.gpDDown.style.backgroundColor = "rgba(16,16,16,0.2)";
		this.gpDDown.style.border = "1.5px solid var(--clr-light)";
		this.gpDDown.style.borderRadius = "6px 6px 2px 2px";
		this.gpDDown.style.boxSizing = "border-box";

		frame.append(this.gpDLeft, this.gpDRight, this.gpDUp, this.gpDDown);


		this.gpA = document.createElement("div");
		this.gpA.style.position = "absolute";
		this.gpA.style.left = "330px";
		this.gpA.style.top = "90px";
		this.gpA.style.width = "30px";
		this.gpA.style.height = "30px";
		this.gpA.style.backgroundColor = "rgba(16,16,16,0.2)";
		this.gpA.style.border = "1.5px solid var(--clr-light)";
		this.gpA.style.borderRadius = "15px";
		this.gpA.style.boxSizing = "border-box";

		this.gpB = document.createElement("div");
		this.gpB.style.position = "absolute";
		this.gpB.style.left = "360px";
		this.gpB.style.top = "60px";
		this.gpB.style.width = "30px";
		this.gpB.style.height = "30px";
		this.gpB.style.backgroundColor = "rgba(16,16,16,0.2)";
		this.gpB.style.border = "1.5px solid var(--clr-light)";
		this.gpB.style.borderRadius = "15px";
		this.gpB.style.boxSizing = "border-box";

		this.gpX = document.createElement("div");
		this.gpX.style.position = "absolute";
		this.gpX.style.left = "300px";
		this.gpX.style.top = "60px";
		this.gpX.style.width = "30px";
		this.gpX.style.height = "30px";
		this.gpX.style.backgroundColor = "rgba(16,16,16,0.2)";
		this.gpX.style.border = "1.5px solid var(--clr-light)";
		this.gpX.style.borderRadius = "15px";
		this.gpX.style.boxSizing = "border-box";

		this.gpY = document.createElement("div");
		this.gpY.style.position = "absolute";
		this.gpY.style.left = "330px";
		this.gpY.style.top = "30px";
		this.gpY.style.width = "30px";
		this.gpY.style.height = "30px";
		this.gpY.style.backgroundColor = "rgba(16,16,16,0.2)";
		this.gpY.style.border = "1.5px solid var(--clr-light)";
		this.gpY.style.borderRadius = "15px";
		this.gpY.style.boxSizing = "border-box";

		frame.append(this.gpA, this.gpB, this.gpX, this.gpY);


		const leftStickBoarder = document.createElement("div");
		leftStickBoarder.style.position = "absolute";
		leftStickBoarder.style.left = "120px";
		leftStickBoarder.style.top = "100px";
		leftStickBoarder.style.width = "60px";
		leftStickBoarder.style.height = "60px";
		leftStickBoarder.style.border = "1.5px solid var(--clr-light)";
		leftStickBoarder.style.borderRadius = "30px";
		leftStickBoarder.style.boxSizing = "border-box";
		frame.appendChild(leftStickBoarder);

		const rightStickBoarder = document.createElement("div");
		rightStickBoarder.style.position = "absolute";
		rightStickBoarder.style.left = "240px";
		rightStickBoarder.style.top = "100px";
		rightStickBoarder.style.width = "60px";
		rightStickBoarder.style.height = "60px";
		rightStickBoarder.style.border = "1.5px solid var(--clr-light)";
		rightStickBoarder.style.borderRadius = "30px";
		rightStickBoarder.style.boxSizing = "border-box";
		frame.appendChild(rightStickBoarder);
		
		this.gpLStick = document.createElement("div");
		this.gpLStick.style.position = "absolute";
		this.gpLStick.style.left = "130px";
		this.gpLStick.style.top = "110px";
		this.gpLStick.style.width = "40px";
		this.gpLStick.style.height= "40px";
		this.gpLStick.style.backgroundColor = "var(--clr-light)";
		this.gpLStick.style.borderRadius = "20px";
		frame.appendChild(this.gpLStick);

		this.gpRStick = document.createElement("div");
		this.gpRStick.style.position = "absolute";
		this.gpRStick.style.left = "250px";
		this.gpRStick.style.top = "110px";
		this.gpRStick.style.width = "40px";
		this.gpRStick.style.height= "40px";
		this.gpRStick.style.backgroundColor = "var(--clr-light)";
		this.gpRStick.style.borderRadius = "20px";
		frame.appendChild(this.gpRStick);

		this.gpShare = document.createElement("div");
		this.gpShare.style.position = "absolute";
		this.gpShare.style.left = "125px";
		this.gpShare.style.top = "16px";
		this.gpShare.style.width = "14px";
		this.gpShare.style.height = "22px";
		this.gpShare.style.backgroundColor = "rgba(16,16,16,0.2)";
		this.gpShare.style.border = "1.5px solid var(--clr-light)";
		this.gpShare.style.borderRadius = "8px";
		this.gpShare.style.boxSizing = "border-box";

		this.gpMenu = document.createElement("div");
		this.gpMenu.style.position = "absolute";
		this.gpMenu.style.left = "280px";
		this.gpMenu.style.top = "16px";
		this.gpMenu.style.width = "14px";
		this.gpMenu.style.height = "22px";
		this.gpMenu.style.backgroundColor = "rgba(16,16,16,0.2)";
		this.gpMenu.style.border = "1.5px solid var(--clr-light)";
		this.gpMenu.style.borderRadius = "8px";
		this.gpMenu.style.boxSizing = "border-box";

		this.gpLogo = document.createElement("div");
		this.gpLogo.style.position = "absolute";
		this.gpLogo.style.left = "198px";
		this.gpLogo.style.top = "105px";
		this.gpLogo.style.width = "24px";
		this.gpLogo.style.height = "24px";
		this.gpLogo.style.backgroundColor = "rgba(16,16,16,0.2)";
		this.gpLogo.style.border = "1.5px solid var(--clr-light)";
		this.gpLogo.style.borderRadius = "12px";
		this.gpLogo.style.boxSizing = "border-box";

		this.gpTrackPad = document.createElement("div");
		this.gpTrackPad.style.position = "absolute";
		this.gpTrackPad.style.left = "150px";
		this.gpTrackPad.style.top = "0px";
		this.gpTrackPad.style.width = "120px";
		this.gpTrackPad.style.height = "70px";
		this.gpTrackPad.style.backgroundColor = "rgba(16,16,16,0.2)";
		this.gpTrackPad.style.border = "1.5px solid var(--clr-light)";
		this.gpTrackPad.style.borderRadius = "0 0 8px 8px";
		this.gpTrackPad.style.boxSizing = "border-box";

		frame.append(this.gpShare, this.gpMenu, this.gpLogo, this.gpTrackPad);

		this.gpLeftTriggerLabel = document.createElement("div");
		this.gpLeftTriggerLabel.textContent = "";
		this.gpLeftTriggerLabel.style.fontSize = "small";
		this.gpLeftTriggerLabel.style.color = "var(--clr-light)";
		this.gpLeftTriggerLabel.style.position = "absolute";
		this.gpLeftTriggerLabel.style.left = "135px";
		this.gpLeftTriggerLabel.style.top = "-28px";

		this.gpRightTriggerLabel = document.createElement("div");
		this.gpRightTriggerLabel.textContent = "";
		this.gpRightTriggerLabel.style.fontSize = "small";
		this.gpRightTriggerLabel.style.color = "var(--clr-light)";
		this.gpRightTriggerLabel.style.position = "absolute";
		this.gpRightTriggerLabel.style.left = "335px";
		this.gpRightTriggerLabel.style.top = "-28px";

		this.gpLeftStickLabel = document.createElement("div");
		this.gpLeftStickLabel.textContent = "";
		this.gpLeftStickLabel.style.whiteSpace = "pre-wrap";
		this.gpLeftStickLabel.style.fontSize = "small";
		this.gpLeftStickLabel.style.color = "var(--clr-light)";
		this.gpLeftStickLabel.style.position = "absolute";
		this.gpLeftStickLabel.style.left = "40px";
		this.gpLeftStickLabel.style.top = "130px";

		this.gpRightStickLabel = document.createElement("div");
		this.gpRightStickLabel.textContent = "";
		this.gpRightStickLabel.style.whiteSpace = "pre-wrap";
		this.gpRightStickLabel.style.fontSize = "small";
		this.gpRightStickLabel.style.color = "var(--clr-light)";
		this.gpRightStickLabel.style.position = "absolute";
		this.gpRightStickLabel.style.left = "310px";
		this.gpRightStickLabel.style.top = "130px";

		frame.append(this.gpLeftTriggerLabel, this.gpRightTriggerLabel, this.gpLeftStickLabel, this.gpRightStickLabel);

		if (forced) {
			this.SetupToolbar();

			this.AddToolbarButton("Test vibration", "mono/gamepad.svg?light").onclick = ()=> {
				const dialog = this.DialogBox("280px");
				dialog.innerBox.style.margin = "20px";
				dialog.btnCancel.style.display = "none";
				
				const divStrong = document.createElement("div");
				divStrong.textContent = "Strong magnitude: ";
				divStrong.style.display = "inline-block";
				divStrong.style.minWidth = "200px";
				dialog.innerBox.appendChild(divStrong);
		
				const strong = document.createElement("input");
				strong.type = "range";
				strong.min = 0;
				strong.max = 100;
				strong.value = 100;
				strong.style.width = "200px";
				dialog.innerBox.appendChild(strong);

				dialog.innerBox.appendChild(document.createElement("br"));
				dialog.innerBox.appendChild(document.createElement("br"));

				const divWeak = document.createElement("div");
				divWeak.textContent = "Weak magnitude: ";
				divWeak.style.display = "inline-block";
				divWeak.style.minWidth = "200px";
				dialog.innerBox.appendChild(divWeak);
		
				const weak = document.createElement("input");
				weak.type = "range";
				weak.min = 0;
				weak.max = 100;
				weak.value = 100;
				weak.style.width = "200px";
				dialog.innerBox.appendChild(weak);

				dialog.innerBox.appendChild(document.createElement("br"));
				dialog.innerBox.appendChild(document.createElement("br"));

				const btnDualRumble = document.createElement("input");
				btnDualRumble.type = "button";
				btnDualRumble.value = "Vibrate";
				dialog.innerBox.append(btnDualRumble);

				dialog.innerBox.appendChild(document.createElement("br"));
				dialog.innerBox.appendChild(document.createElement("br"));

				const chkVibrateOnPress = document.createElement("input");
				chkVibrateOnPress.type = "checkbox";
				chkVibrateOnPress.checked = this.vibrateOnPress;
				dialog.innerBox.appendChild(chkVibrateOnPress);
				this.AddCheckBoxLabel(dialog.innerBox, chkVibrateOnPress, "Vibrate on button press");
	
				let gamepads = navigator.getGamepads();

				btnDualRumble.onclick = ()=> {
					for (let i=0; i<gamepads.length; i++) {
						if (gamepads === null) continue;
						if (!gamepads[i].vibrationActuator) continue;
						gamepads[i].vibrationActuator.playEffect("dual-rumble", {
							startDelay: 0,
							duration: 2000,
							strongMagnitude: strong.value / 100,
							weakMagnitude: weak.value / 100
						});
					}
				};


				dialog.btnOK.addEventListener("click", ()=>{
					this.vibrateOnPress = chkVibrateOnPress.checked;
				});
			};
		}

		window.addEventListener("gamepadconnected", event=> this.OnGamePadConnected(event));
		window.addEventListener("gamepaddisconnected", event=> this.OnGamePadDisconnected(event));
	}

	OnGamePadConnected() {
		this.isGamePadListening = true;
		this.gamepad.style.display = "initial";
		this.GamepadLoop([
			this.gpA,
			this.gpB,
			this.gpX,
			this.gpY,
			
			this.gpLeftButton,
			this.gpRightButton,
			this.gpLeftTrigger,
			this.gpRightTrigger,

			this.gpShare,
			this.gpMenu,

			this.gpLStick,
			this.gpRStick,

			this.gpDUp,
			this.gpDDown,
			this.gpDLeft,
			this.gpDRight,

			this.gpLogo,
			this.gpTrackPad
		]);
	}

	OnGamePadDisconnected() {
		if (this.params !== "gamepad") this.gamepad.style.display = "none";
		this.isGamePadListening = false;
	}

	GamepadLoop(elements) {
		if (this.isClosed) return;
		if (!this.isGamePadListening) return;

		let gamepads = navigator.getGamepads();

		for (var j = 0; j < gamepads.length; j++) {
			let gamepad = gamepads[j];
			if (!gamepad) continue;

			let anyButton = false;

			for (let i = 0; i < gamepad.buttons.length; i++) {
				if (gamepad.buttons[i].pressed) {
					anyButton = true;
					elements[i].style.backgroundColor = "var(--clr-accent)";
					elements[i].style.filter = "brightness(2.5)";
					elements[i].style.boxShadow = "var(--clr-accent) 0 0 4px";
				}
				else {
					elements[i].style.filter = "none";
					elements[i].style.boxShadow = "none";
				}
			}
	
			elements[4].style.transform = `scaleY(${gamepad.buttons[4].pressed ? ".8" : "1"})`;
			elements[5].style.transform = `scaleY(${gamepad.buttons[5].pressed ? ".8" : "1"})`;
			elements[6].style.transform = `rotateX(${gamepad.buttons[6].value * 70}deg)`;
			elements[7].style.transform = `rotateX(${gamepad.buttons[7].value * 70}deg)`;

			elements[10].style.transform = `translate(${gamepad.axes[0]*20}px,${gamepad.axes[1]*20}px)`;
			elements[11].style.transform = `translate(${gamepad.axes[2]*20}px,${gamepad.axes[3]*20}px)`;
	
			let leftTrig = gamepad.buttons[6].value.toString();
			let rightTrig = gamepad.buttons[7].value.toString();
			let leftStickX = gamepad.axes[0].toString();
			let leftStickY = gamepad.axes[1].toString();
			let rightStickX = gamepad.axes[2].toString();
			let rightStickY = gamepad.axes[3].toString();
	
			if (leftTrig.length > 10) leftTrig = leftTrig.substring(0, 10);
			if (rightTrig.length > 10) rightTrig = rightTrig.substring(0, 10);
			if (leftStickX.length > 8) leftStickX = leftStickX.substring(0, 8);
			if (leftStickY.length > 8) leftStickY = leftStickY.substring(0, 8);
			if (rightStickX.length > 8) rightStickX = rightStickX.substring(0, 8);
			if (rightStickY.length > 8) rightStickY = rightStickY.substring(0, 8);
			
			this.gpLeftTriggerLabel.textContent = leftTrig;
			this.gpRightTriggerLabel.textContent = rightTrig;
	
			this.gpLeftStickLabel.textContent = `x: ${leftStickX}${String.fromCharCode(13)}${String.fromCharCode(10)}y: ${leftStickY}`;
			this.gpRightStickLabel.textContent = `x: ${rightStickX}${String.fromCharCode(13)}${String.fromCharCode(10)}y: ${rightStickY}`;
		
			if (anyButton && this.vibrateOnPress && gamepad.vibrationActuator) {
				let weak = 1.0;
				let strong = 1.0;

				if (gamepad.buttons[6].pressed && gamepad.buttons[7].pressed) { //both
					strong = gamepad.buttons[6].value;
					weak = gamepad.buttons[7].value;
				}
				else if (gamepad.buttons[6].pressed) { //LT
					strong = gamepad.buttons[6].value;
					weak = 0;
				}
				else if (gamepad.buttons[7].pressed) { //RT
					weak = gamepad.buttons[7].value;
					strong = 0;
				}

				gamepad.vibrationActuator.playEffect("dual-rumble", {
					startDelay: 0,
					duration: 40,
					weakMagnitude: weak,
					strongMagnitude: strong
				});
			}
		
		}

		setTimeout(()=> this.GamepadLoop(elements), 33);
	}

	Close() { //override
		super.Close();

		if (this.isGamePadListening) {
			this.isGamePadListening = false;
			window.removeEventListener("gamepadconnected", event=> this.OnGamePadConnected(event));
			window.removeEventListener("gamepaddisconnected", event=> this.OnGamePadDisconnected(event));
		}
	}

	PopOut() { //override
		super.PopOut();
		this.popOutWindow.onkeydown = this.win.onkeydown;
		this.popOutWindow.onkeyup = this.win.onkeyup;
	}

	PushHistory(key) {
		const element = document.createElement("div");
		element.style.display = "inline-block";
		element.style.boxSizing = "border-box";
		element.style.textAlign = "center";
		element.style.lineHeight = "28px";
		element.style.height = "28px";
		element.style.margin = "0 1px";
		element.style.padding = "0";
		element.style.borderRadius = "8px";
		element.style.fontSize = "small";
		element.style.color = "#000";
		element.style.backgroundColor = "var(--clr-accent)";

		if (this.keyElements.hasOwnProperty(key)) {
			element.textContent = this.keyText[key];
		}
		else {
			element.textContent = key;
		}

		let width = Math.max(element.textContent.length * 10, 28);
		element.style.width = `${width}px`;

		this.history.style.width = `${this.history.offsetWidth + width + 2}px`;

		this.history.appendChild(element);
	}

	CreateKey(key, container, isMedia=false) {
		const element = document.createElement("div");
		element.style.display = "inline-block";
		element.style.boxSizing = "border-box";
		element.style.textAlign = "center";
		element.style.lineHeight = "40px";
		element.style.width = "40px";
		element.style.height = "40px";
		element.style.margin = "0 2px";
		element.style.border = "1px solid var(--clr-light)";
		element.style.borderRadius = "8px";
		element.style.transition = ".15s";
		element.style.backgroundColor = "rgba(16,16,16,.2)";
		element.textContent= key.text;

		if (isMedia) {
			element.style.borderRadius = "40%";
		}

		switch (key.code) {
		case "ArrowUp": element.style.marginLeft = "46px"; break;
		case "NumpadAdd": element.style.height = "84px"; break;
		case "NumpadEnter": element.style.height = "84px"; break;
		case "Numpad0": element.style.width = "84px"; break;
		}

		switch (key.text) {
		case "Esc": element.style.marginRight="46px"; break;
		case "F4" : element.style.marginRight="32px"; break;
		case "F8" : element.style.marginRight="32px"; break;

		case "Tab"  : element.style.width="60px"; break;
		case "Caps" : element.style.width="80px"; break;
		case "Shift": element.style.width="115px"; break;
		case "Ctrl" : element.style.width="60px"; break;
		case "OS" : element.style.width="60px"; break;
		case "Alt" : element.style.width="60px"; break;
		case "Menu" : element.style.width="60px"; break;

		case "Backspace" : element.style.width="100px"; break;
		case "\\" : element.style.width="80px"; break;
		case "Enter" : element.style.width="105px"; break;

		case "Ins":
		case "Home":
		case "Up":
		case "Del":
		case "End":
		case "Down":
		case "Num":
			element.style.fontSize = "12px";
			break;

		case "Space":
			element.style.width = "226px";
			element.style.whiteSpace = "pre-wrap";
			element.textContent = " ";
			break;
		}

		switch (key.code) {
		case "CapsLock":
			this.CreateLed(key.code, element);
			break;
				
		case "NumLock":
			this.CreateLed(key.code, element);
			break;

		case "ScrollLock":
			this.CreateLed(key.code, element, {x:15, y:-56});
			break;
		}

		container.appendChild(element);
		this.keyText[key.code] = key.text;
		this.keyElements[key.code] = element;
		return element;
	}

	CreateLed(keycode, element, position={x:-14, y:-26}) {
		const led = document.createElement("div");
		led.style.position = "relative";
		led.style.left = `${position.x}px`;
		led.style.top = `${position.y}px`;
		led.style.width = "8px";
		led.style.height = "8px";
		led.style.borderRadius = "4px";
		led.style.transition = ".2s";
		element.appendChild(led);

		this.led[keycode] = led;

		return led;
	}

	CheckLed(event) {
		this.led["CapsLock"].style.backgroundColor = event.getModifierState("CapsLock") ? "rgb(172,224,48)" : "transparent";
		this.led["CapsLock"].style.boxShadow = event.getModifierState("CapsLock") ? "rgb(172,224,48) 0 0 4px" : "transparent 0 0 0";
		this.led["NumLock"].style.backgroundColor = event.getModifierState("NumLock") ? "rgb(172,224,48)" : "transparent";
		this.led["NumLock"].style.boxShadow = event.getModifierState("NumLock") ? "rgb(172,224,48) 0 0 4px" : "transparent 0 0 0";
		this.led["ScrollLock"].style.backgroundColor = event.getModifierState("ScrollLock") ? "rgb(172,224,48)" : "transparent";
		this.led["ScrollLock"].style.boxShadow = event.getModifierState("ScrollLock") ? "rgb(172,224,48) 0 0 4px" : "transparent 0 0 0";
	}
}