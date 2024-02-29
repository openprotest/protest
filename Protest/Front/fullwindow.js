const WIN = {
	ANIME_DURATION: 200,
	x0: 0,
	y0: 0,
	offsetX: 0,
	offsetY: 0,
	startX: 10,
	startY: 10,
	count: 0,
	always_maxed: true,
};

class Window {
	constructor() {
		this.isMaximized = false;
		this.isMinimized = false;
		this.isClosed = false;
		this.themeColor = [64,64,64];
		this.position = null;
		this.escAction = null;
		this.defaultElement = null;
		this.params = {};
		this.messagesQueue = [];
		this.cssDependencies = [];
		this.toolbar = null;
		this.fullWindow = true;

		this.win = document.createElement("section");
		this.win.style.left = "0";
		this.win.style.top = "0";
		this.win.style.width = "100%";
		this.win.style.height = "100%";
		this.win.style.backgroundColor = "transparent";
		this.win.style.borderTop = "unset";
		this.win.style.borderRadius = "unset";
		this.win.className = "window";
		container.appendChild(this.win);

		this.content = document.createElement("div");
		this.content.className = "win-content";
		this.content.style.left = "0";
		this.content.style.right = "0";
		this.content.style.top = "0";
		this.content.style.bottom = "0";
		this.win.appendChild(this.content);

	}

	ConfirmBox(message, okOnly=false, icon=null) {
		//if a dialog is already opened, queue
		if (this.popOutWindow) {
			if (this.popOutWindow.document.body.getElementsByClassName("win-dim")[0] != null) {
				this.messagesQueue.push([message, okOnly]);
				return null;
			}
		}
		else {
			document.getSelection().removeAllRanges();
			if (this.win.getElementsByClassName("win-dim")[0] != null) {
				this.messagesQueue.push([message, okOnly]);
				return null;
			}
		}

		const dim = document.createElement("div");
		dim.className = "win-dim";

		if (this.popOutWindow) {
			this.popOutWindow.document.body.appendChild(dim);
			dim.style.top = "0";
		}
		else {
			this.win.appendChild(dim);
		}

		const confirmBox = document.createElement("div");
		confirmBox.className = "win-confirm";
		dim.appendChild(confirmBox);

		const messageBox = document.createElement("div");
		messageBox.textContent = message;
		messageBox.style.whiteSpace = "break-spaces";
		confirmBox.appendChild(messageBox);

		const buttonBox = document.createElement("div");
		buttonBox.style.paddingTop = "16px";
		confirmBox.appendChild(buttonBox);

		const okButton = document.createElement("input");
		okButton.type = "button";
		okButton.value = "OK";
		buttonBox.appendChild(okButton);

		const cancelButton = document.createElement("input");
		cancelButton.type = "button";
		cancelButton.value = "Cancel";
		if (!okOnly) buttonBox.appendChild(cancelButton);

		if (icon) {
			messageBox.style.paddingLeft = "64px";
			buttonBox.style.paddingLeft = "64px";
			confirmBox.style.backgroundImage = `url(${icon})`;
			confirmBox.style.backgroundSize = "48px 48px";
			confirmBox.style.backgroundPosition = "16px calc(50% - 16px)";
			confirmBox.style.backgroundRepeat = "no-repeat";
		}

		this.content.style.filter = "blur(4px)";

		dim.onmouseup = dim.onmousedown = event=> {
			event.stopPropagation();
			this.BringToFront();
		};

		let once = false;
		cancelButton.onclick = ()=> {
			if (once) return;
			once = true;
			dim.style.filter = "opacity(0)";
			confirmBox.style.transform = "scaleY(.2)";
			this.content.style.filter = "none";
			setTimeout(()=> {
				if (this.popOutWindow)
					this.popOutWindow.document.body.removeChild(dim);
				else
					this.win.removeChild(dim);

				let next = this.messagesQueue.shift();
				if (next) this.ConfirmBox(next[0], next[1]);
			}, WIN.ANIME_DURATION);
		};

		okButton.onclick = event=> cancelButton.onclick(event);
		okButton.focus();

		confirmBox.onkeydown = event=> {
			if (event.key === "Escape") {
				cancelButton.onclick();
			}
		};

		return okButton;
	}

	DialogBox(height) {
		//if a dialog is already opened, do nothing
		if (this.popOutWindow) {
			if (this.popOutWindow.document.body.getElementsByClassName("win-dim")[0] != null) return null;
		}
		else {
			document.getSelection().removeAllRanges();
			if (this.win.getElementsByClassName("win-dim")[0] != null) return null;
		}

		const dim = document.createElement("div");
		dim.className = "win-dim";

		if (this.popOutWindow) {
			this.popOutWindow.document.body.appendChild(dim);
			dim.style.top = "0";
		}
		else {
			this.win.appendChild(dim);
		}

		const dialogBox = document.createElement("div");
		dialogBox.className = "win-dialog";
		dim.appendChild(dialogBox);
		if (height != undefined) {
			dialogBox.style.maxHeight = height;
			dialogBox.style.borderRadius = "0 0 8px 8px";
		}
		dim.appendChild(dialogBox);

		let innerBox = document.createElement("div");
		innerBox.style.position = "absolute";
		innerBox.style.left = "0";
		innerBox.style.right = "0";
		innerBox.style.top = "0";
		innerBox.style.bottom = "52px";
		innerBox.style.overflowY = "auto";
		dialogBox.appendChild(innerBox);

		const buttonBox = document.createElement("div");
		buttonBox.style.position = "absolute";
		buttonBox.style.textAlign = "center";
		buttonBox.style.left = "4px";
		buttonBox.style.right = "4px";
		buttonBox.style.bottom = "8px";
		dialogBox.appendChild(buttonBox);

		const okButton = document.createElement("input");
		okButton.type = "button";
		okButton.value = "OK";
		buttonBox.appendChild(okButton);

		const cancelButton = document.createElement("input");
		cancelButton.type = "button";
		cancelButton.value = "Cancel";
		buttonBox.appendChild(cancelButton);

		this.content.style.filter = "blur(4px)";

		dim.onmouseup = dim.onmousedown = event=> {
			event.stopPropagation();
			this.BringToFront();
		};

		const Abort = ()=> {
			if (this.popOutWindow)
				this.popOutWindow.document.body.removeChild(dim);
			else
				this.win.removeChild(dim);
		};

		let once = false;
		const Close = ()=> {
			if (once) return;
			once = true;
			dim.style.filter = "opacity(0)";
			dialogBox.style.transform = "scaleY(.2)";
			this.content.style.filter = "none";
			setTimeout(()=> Abort(), WIN.ANIME_DURATION);
		};

		innerBox.onkeydown = event=>{
			if (event.key === "Escape") {
				cancelButton.onclick();
			}
		};

		cancelButton.onclick = ()=> Close();
		okButton.onclick = event=> cancelButton.onclick(event);

		return {
			innerBox: innerBox,
			buttonBox: buttonBox,
			okButton: okButton,
			cancelButton: cancelButton,
			Close: Close
		};
	}

	SetupFloatingMenu() {
		this.floating = document.createElement("div");
		this.floating.className = "floating-menu";
		this.floating.style.visibility = "hidden";
		this.content.appendChild(this.floating);

		this.floating.onmousedown = event=> event.stopPropagation();

		return this.floating;
	}


	SetTitle(title = "") {
		document.title = title;
	}

	SetIcon(iconPath) {
		const favicon_light = document.createElement("link");
		favicon_light.rel = "icon";
		favicon_light.href = iconPath;
		favicon_light.media = "(prefers-color-scheme: light";

		const favicon_dark = document.createElement("link");
		favicon_dark.rel = "icon";
		favicon_dark.href = `${iconPath}?light`;
		favicon_dark.media = "(prefers-color-scheme: dark)";

		document.head.appendChild(favicon_light);
		document.head.appendChild(favicon_dark);
	}

	SetThemeColor(color) {
		this.themeColor = color;
		this.content.style.backgroundColor = `rgb(${color[0]},${color[1]},${color[2]})`;

		if ((this.themeColor[0] + this.themeColor[1] + this.themeColor[2]) / 3 > 127)
			this.content.style.color = "var(--clr-dark)";
	}

	BringToFront() {
	}

	AddCheckBoxLabel(parent, checkbox, label) {
		let id = Date.now() + Math.random() * 1000;
		checkbox.id = "id" + id;

		const newLabel = document.createElement("label");
		newLabel.textContent = label;
		newLabel.setAttribute("for", "id" + id);
		newLabel.setAttribute("tabindex", "0");
		newLabel.style.maxWidth = "80%";
		parent.appendChild(newLabel);

		newLabel.onkeydown = event=> {
			if (checkbox.disabled) return;
			if (event.key === " " || event.key === "Enter") {
				checkbox.checked = !checkbox.checked;
				event.preventDefault();
				if (checkbox.onchange) checkbox.onchange();
			}
		};

		return newLabel;
	}

	AddRadioLabel(parent, radio, label) {
		let id = Date.now() + Math.random() * 1000;
		radio.id = "id" + id;

		const newLabel = document.createElement("label");
		newLabel.textContent = label;
		newLabel.setAttribute("for", "id" + id);
		newLabel.setAttribute("tabindex", "0");
		newLabel.style.maxWidth = "80%";
		parent.appendChild(newLabel);

		newLabel.onkeydown = event=> {
			if (radio.disabled) return;
			if (event.key === " " || event.key === "Enter") {
				radio.checked = true;
				event.preventDefault();
				if (radio.onchange) radio.onchange();
			}
		};

		return newLabel;
	}

	AddCssDependencies(filename) {
		if (document.head.querySelectorAll(`link[href$='${filename}']`).length == 0) {
			const cssLink = document.createElement("link");
			cssLink.rel = "stylesheet";
			cssLink.href = filename;
			document.head.appendChild(cssLink);
		}

		if (!this.cssDependencies.includes(filename))
			this.cssDependencies.push(filename);
	}
}