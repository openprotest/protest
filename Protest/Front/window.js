/*
 This program is free software: you can redistribute it and/or modify
 it under the terms of the GNU General Public License as published by
 the Free Software Foundation, either version 3 of the License, or
 (at your option) any later version.
 This program is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU General Public License for more details.
 You should have received a copy of the GNU General Public License
 along with this program.  If not, see <https://www.gnu.org/licenses/>.

 windows.js is a vanilla javascript library, designed for Pro-test 5.0
 Developed by Andreas Venizelou, 2024
 Released into the public domain under the GPL v3
 For more information, visit https://github.com/openprotest/protest
*/
var onMobile = /Android|webOS|iPhone|iPad|iPod|Opera Mini/i.test(navigator.userAgent);

const WIN = {
	ANIME_DURATION: 200,
	array: [],
	active: null,
	focused: null,
	iconSize: onMobile ? 48 : 56,
	isMoving: false,
	isResizing: false,
	isIcoMoving: false,
	controlPressed: null,
	x0: 0,
	y0: 0,
	offsetX: 0,
	offsetY: 0,
	startX: 10,
	startY: 10,
	count: 0,
	alwaysMaxed: false,

	AlignIcon: (ignoreActive)=> {
		const max = onMobile ? 48 : 56;
		const total = MENU.isAttached ? WIN.array.length+1 : WIN.array.length;

		if (UI.taskbarPosition === "left" || UI.taskbarPosition === "right") {
			WIN.iconSize = (container.clientHeight / total > max) ? max : container.clientHeight / total;
			WIN.array = WIN.array.sort((a, b)=> a.task.offsetTop - b.task.offsetTop);
		}
		else {
			WIN.iconSize = (container.clientWidth / total > max) ? max : container.clientWidth / total;
			WIN.array = WIN.array.sort((a, b)=> a.task.offsetLeft - b.task.offsetLeft);
		}

		if (MENU.isAttached) {
			attachedmenubutton.style.width = `${WIN.iconSize - 8}px`;
			attachedmenubutton.style.height = `${WIN.iconSize - 8}px`;
		}

		for (let i = 0; i < WIN.array.length; i++) {
			WIN.array[i].task.style.width = `${WIN.iconSize - 4}px`;
			WIN.array[i].task.style.height = `${WIN.iconSize - 4}px`;
		}

		UI.RearrangeWorkspace(UI.taskbarPosition);

		if (UI.taskbarPosition === "left" || UI.taskbarPosition === "right") {
			for (let i = 0; i < WIN.array.length; i++) {
				if (ignoreActive &&WIN.array[i].task === WIN.active.task) continue;
				const top = `${2 + (MENU.isAttached ? i+1 : i) * WIN.iconSize}px`;
				WIN.array[i].task.style.left = "2px";
				WIN.array[i].task.style.top = top;
				WIN.array[i].task.style.transition = `${WIN.ANIME_DURATION / 1000}s`;
			}
		}
		else {
			for (let i = 0; i < WIN.array.length; i++) {
				if (ignoreActive &&WIN.array[i].task === WIN.active.task) continue;
				const left = `${2 + (MENU.isAttached ? i+1 : i) * WIN.iconSize}px`;
				WIN.array[i].task.style.left = left;
				WIN.array[i].task.style.top = "2px";
				WIN.array[i].task.style.transition = `${WIN.ANIME_DURATION / 1000}s`;
			}
		}

		if (!ignoreActive) {
			setTimeout(()=> {
				for (let i = 0; i < WIN.array.length; i++) {
					WIN.array[i].task.style.transition = "0s";
				}
			}, WIN.ANIME_DURATION);
		}
	},

	GridWindows: ()=> {
		if (WIN.array.length === 0) return;

		let visible = WIN.array.filter(o=> !o.isMinimized && !o.popOutWindow);

		if (visible.length === 0) return;

		if (visible.length === 1) {
			if (!visible[0].isMaximized) visible[0].Toggle();
			return;
		}

		let gridW = Math.ceil(Math.sqrt(visible.length));
		let gridH = gridW;

		while (gridW * gridH >= visible.length + gridW) {
			gridH--;
		}

		for (let y = 0; y < gridH; y++) {
			for (let x = 0; x < gridW; x++) {
				let i = y * gridW + x;
				if (i >= visible.length) break;

				visible[i].win.style.transition = `${WIN.ANIME_DURATION / 1000}s`;

				if (visible[i].isMaximized) visible[i].Toggle();
				visible[i].win.style.left = gridW < 5 ? `calc(${100 * x / gridW}% + 6px)` : `${100 * x / gridW}%`;
				visible[i].win.style.top = gridW < 5 ? `calc(${100 * y / gridH}% + 6px)` : `${100 * y / gridH}%`;
				visible[i].win.style.width = gridW < 5 ? `calc(${100 / gridW}% - 12px)` : `${100 / gridW}%`;
				visible[i].win.style.height = gridW < 5 ? `calc(${100 / gridH}% - 12px)` : `${100 / gridH}%`;

				setTimeout(()=> {
					visible[i].win.style.transition = "0s";
				}, WIN.ANIME_DURATION / 1000);

				setTimeout(()=> {
					visible[i].AfterResize();
				}, WIN.ANIME_DURATION / 1000 + 200);
			}
		}

		//special treatment
		if (visible.length === 3) {
			visible[1].win.style.height = "calc(100% - 12px)";
		}
		else if (visible.length === 5) {
			visible[3].win.style.left = "6px";
			visible[3].win.style.width = "calc(50% - 12px)";
			visible[4].win.style.left = "calc(50% + 6px)";
			visible[4].win.style.width = "calc(50% - 12px)";
		}
		else if (visible.length === 7) {
			visible[4].win.style.height = "calc(66% - 12px)";
			visible[5].win.style.height = "calc(66% - 12px)";
		}
		else if (visible.length === 8) {
			visible[5].win.style.height = "calc(66% - 12px)";
		}
	},

	EscapeHtml: html=> {
		return html
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#39;");
	},

	CreateContextMenuItem: (text, icon)=> {
		const newItem = document.createElement("div");
		newItem.textContent = text;

		if (icon) newItem.style.backgroundImage = `url(${icon})`;

		contextmenu.appendChild(newItem);

		return newItem;
	}
};

document.body.onresize = ()=> {
	if (onMobile) return;

	document.getSelection().removeAllRanges();
	WIN.AlignIcon(false);

	for (let i = 0; i < WIN.array.length; i++) {
		WIN.array[i].AfterResize();
		if (WIN.array[i].InvalidateRecyclerList) WIN.array[i].InvalidateRecyclerList();
	}
};

document.body.onmousemove = event=> {
	if (WIN.active === null) return;
	if (event.buttons != 1) document.body.onmouseup(event);

	document.getSelection().removeAllRanges(); //remove all selections

	if (WIN.isMoving) {
		if (WIN.active.isMaximized && event.clientY < 64) return;

		if (WIN.active.isMaximized) {
			WIN.active.Toggle();
		}

		let x = (WIN.offsetX - (WIN.x0 - event.clientX)) * 100 / container.clientWidth;
		WIN.active.win.style.left = Math.min(100 - WIN.active.win.clientWidth * 100 / container.clientWidth, Math.max(0, x)) + "%";

		let y = (WIN.offsetY - (WIN.y0 - event.clientY)) * 100 / container.clientHeight;
		y = Math.min(100 - WIN.active.win.clientHeight * 100 / container.clientHeight, Math.max(0, y));
		WIN.active.win.style.top = `${(y < 0) ? 0 : y}%`;
	}
	else if (WIN.isResizing) {
		let w = (WIN.offsetX - (WIN.x0 - event.clientX)) * 100 / container.clientWidth;
		let h = (WIN.offsetY - (WIN.y0 - event.clientY)) * 100 / container.clientHeight;
		WIN.active.win.style.width = Math.min(100 - WIN.active.win.offsetLeft * 100 / container.clientWidth, w) + "%";
		WIN.active.win.style.height = Math.min(100 - WIN.active.win.offsetTop * 100 / container.clientHeight, h) + "%";

		WIN.active.AfterResize();
	}
	else if (WIN.isIcoMoving) {
		if (UI.taskbarPosition === "left" || UI.taskbarPosition === "right") {
			let y = WIN.offsetY - (WIN.y0 - event.clientY);
			y = Math.max(0, y);
			y = Math.min(taskbar.clientHeight - WIN.active.task.clientHeight, y);
			WIN.active.task.style.top = `${y}px`;
			WIN.AlignIcon(true);
		}
		else {
			let x = WIN.offsetX - (WIN.x0 - event.clientX);
			x = Math.max(0, x);
			x = Math.min(taskbar.clientWidth - WIN.active.task.clientWidth, x);
			WIN.active.task.style.left = `${x}px`;
			WIN.AlignIcon(true);
		}
	}
};

document.body.onmouseup = ()=> {
	if (WIN.active != null) {
		WIN.active.task.style.transition = `${WIN.ANIME_DURATION / 1000}s`;
		WIN.active.task.style.zIndex = "3";
		WIN.AlignIcon(false);
	}

	WIN.isMoving = false;
	WIN.isResizing = false;
	WIN.isIcoMoving = false;
	WIN.active = null;
};

document.body.onkeydown = event=> {
	if (event.key === "Escape") {
		if (WIN.focused === null) return;
		if (WIN.focused.escAction === null) return;
		WIN.focused.escAction();
	}
};

document.body.onbeforeunload = ()=> {
	/*if (localStorage.getItem("alive_after_close") != "true") {
		fetch("/logout");
	}*/

	LOADER.StoreSession();

	for (let i = 0; i < WIN.array.length; i++)
		if (WIN.array[i].popOutWindow)
			WIN.array[i].popOutWindow.close();
};

taskbar.oncontextmenu = event=> false;

class Window {
	constructor() {
		this.isMaximized = false;
		this.isMinimized = false;
		this.isClosed = false;
		this.position = null;
		this.escAction = null;
		this.defaultElement = null;
		this.args = {};
		this.messagesQueue = [];
		this.cssDependencies = [];
		this.toolbar = null;

		WIN.startX += 2;
		WIN.startY += 6;
		if (WIN.startY >= 40) {
			WIN.startY = 4;
			WIN.startX -= 10;
		}
		if (WIN.startX >= 40) {
			WIN.startY = 10;
			WIN.startX = 10;
		}

		this.win = document.createElement("section");
		this.win.style.left = `${WIN.startX}%`;
		this.win.style.top = `${WIN.startY}%`;
		this.win.style.width = "50%";
		this.win.style.height = "60%";
		this.win.style.zIndex = ++WIN.count;
		this.win.className = "window";
		container.appendChild(this.win);

		this.task = document.createElement("div");
		this.task.setAttribute("role", "button");
		this.task.className = "bar-icon";
		taskbar.appendChild(this.task);

		if (UI.taskbarPosition === "left" || UI.taskbarPosition === "right") {
			this.task.style.left = "2px";
			this.task.style.top = `${2 + WIN.array.length * (onMobile ? 48 : 56)}px`;
		}
		else {
			this.task.style.left = `${2 + WIN.array.length * (onMobile ? 48 : 56)}px`;
			this.task.style.top = "2px";
		}

		this.icon = document.createElement("div");
		this.icon.className = "icon";
		this.task.appendChild(this.icon);

		this.content = document.createElement("div");
		this.content.className = "win-content";
		this.win.appendChild(this.content);

		this.header = document.createElement("header");
		this.header.className = "title";
		this.win.appendChild(this.header);

		this.titleIcon = document.createElement("div");
		this.titleIcon.className = "titleicon";
		this.win.appendChild(this.titleIcon);

		this.resize = document.createElement("div");
		this.resize.className = "resize";
		this.win.appendChild(this.resize);

		this.closeButton = document.createElement("div");
		this.closeButton.className = "control close-box";
		this.win.appendChild(this.closeButton);
		if (onMobile) {
			this.closeButton.style.width = this.closeButton.style.height = "28px";
			this.closeButton.style.backgroundSize = "26px";
			this.closeButton.style.backgroundPosition = "1px 1px";
		}

		this.maximizeButton = document.createElement("div");
		if (!onMobile) {
			this.maximizeButton.className = "control maximize-box";
			this.win.appendChild(this.maximizeButton);
		}

		this.minimizeButton = document.createElement("div");
		if (!onMobile) {
			this.minimizeButton.className = "control minimize-box";
			this.win.appendChild(this.minimizeButton);
		}

		this.popOutButton = document.createElement("div");
		if (!onMobile) {
			this.popOutButton.className = "control popout-box";
			this.win.appendChild(this.popOutButton);
		}

		this.win.tabIndex = "0";
		this.win.addEventListener("focus", ()=> this.BringToFront());

		let dblclickCheck = false;
		this.win.onmousedown = event=> {
			if (!this.popOutWindow) {
				this.BringToFront();
			}

			if (event.button === 0 && event.offsetY < 32) { //left click on title bar
				WIN.offsetX = this.win.offsetLeft;
				WIN.offsetY = this.win.offsetTop;
				WIN.x0 = event.clientX;
				WIN.y0 = event.clientY;
				WIN.isMoving = true;

				this.win.style.transition = "0s";

				if (dblclickCheck && !onMobile) {
					this.Toggle();
					dblclickCheck = false;
					return;
				}
				dblclickCheck = true;
				setTimeout(()=> { dblclickCheck = false; }, 333);
			}
			WIN.active = this;
			WIN.focused = this;
		};

		this.resize.onmousedown = event=> {
			this.BringToFront();
			if (event.button === 0) { //left click
				this.win.style.transition = "0s";
				WIN.offsetX = this.win.clientWidth;
				WIN.offsetY = this.win.clientHeight;
				WIN.x0 = event.clientX;
				WIN.y0 = event.clientY;
				WIN.isResizing = true;
				WIN.active = this;
			}
			event.stopPropagation();
		};

		let iconX = 0;
		let iconY = 0;
		this.task.onmousedown = event=> {
			if (event.button === 0) { //left click
				iconX = this.task.offsetLeft;
				iconY = this.task.offsetTop;

				this.task.style.zIndex = "5";
				WIN.offsetX = this.task.offsetLeft;
				WIN.offsetY = this.task.offsetTop;
				WIN.x0 = event.clientX;
				WIN.y0 = event.clientY;
				WIN.isIcoMoving = true;
				WIN.active = this;
			}
		};

		this.task.onmouseup = event=> {
			if (event.button === 0 && !MENU.isDragging && Math.abs(iconX - this.task.offsetLeft) < 4 && Math.abs(iconY - this.task.offsetTop) < 4 ) { //clicked but not moved
				if (this.popOutWindow) {
					this.popOutWindow.focus();
				}
				this.Minimize();
				if (!this.isMinimized && this.defaultElement) this.defaultElement.focus();
			}
			else if (event.button === 1) { //middle click
				this.Close();
				event.preventDefault();
			}
			else if (event.button === 2) { //right click
				event.stopPropagation();

				contextmenu.textContent = "";

				if (!this.popOutWindow) {
					const popOutItem = WIN.CreateContextMenuItem("Pop out", "controls/popout.svg");
					popOutItem.onclick = ()=> this.PopOut();

					if (this.isMinimized) {
						const restoreItem = WIN.CreateContextMenuItem("Restore", "controls/maximize.svg");
						restoreItem.onclick = ()=> this.Minimize();
					}
					else {
						const minimizeItem = WIN.CreateContextMenuItem("Minimize", "controls/minimize.svg");
						minimizeItem.onclick = ()=> this.Minimize(true);

						const toggleItem = WIN.CreateContextMenuItem(this.isMaximized ? "Restore" : "Maximize", "controls/maximize.svg");
						toggleItem.onclick = ()=> this.Toggle();
					}
				}

				if (WIN.array.length > 1) {
					const closeOthersItem = WIN.CreateContextMenuItem("Close others", "controls/close.svg");
					closeOthersItem.onclick = ()=> {
						let copy = WIN.array.filter(()=> true);
						for (let i = 0; i < copy.length; i++) {
							if (copy[i] === this) continue;
							copy[i].Close();
						}
					};
				}

				const closeItem = WIN.CreateContextMenuItem("Close", "controls/close.svg");
				closeItem.onclick = ()=> this.Close();

				switch (UI.taskbarPosition) {
				case "left":
					contextmenu.style.left = "8px";
					contextmenu.style.right = "unset";
					contextmenu.style.top = `${event.y}px`;
					contextmenu.style.bottom = "unset";
					break;

				case "right":
					contextmenu.style.left = "unset";
					contextmenu.style.right = "8px";
					contextmenu.style.top = `${event.y}px`;
					contextmenu.style.bottom = "unset";
					break;

				case "top":
					contextmenu.style.left = `${event.x}px`;
					contextmenu.style.right = "unset";
					contextmenu.style.top = "8px";
					contextmenu.style.bottom = "unset";
					break;

				default: //bottom
					contextmenu.style.left = `${event.x}px`;
					contextmenu.style.right = "unset";
					contextmenu.style.top = "unset";
					contextmenu.style.bottom = "8px";
					break;
				}

				contextmenu.style.display = "block";
				contextmenu.focus();

				if (UI.taskbarPosition === "left" || UI.taskbarPosition === "right") {
					if (contextmenu.offsetTop + contextmenu.offsetHeight > container.offsetHeight) {
						contextmenu.style.top = `${container.offsetHeight - contextmenu.offsetHeight - 8}px`;
					}
					else if (contextmenu.offsetTop < 8) {
						contextmenu.style.top = "8px";
					}
				}
				else {
					if (contextmenu.offsetLeft + contextmenu.offsetWidth > container.offsetWidth) {
						contextmenu.style.left = `${container.offsetWidth - contextmenu.offsetWidth - 8}px`;
					}
					else if (contextmenu.offsetLeft < 8) {
						contextmenu.style.left = "8px";
					}
				}
			}
		};

		this.content.onmousedown = event=> {
			this.win.style.transition = "0s";

			if (!this.popOutWindow)
				this.BringToFront();

			event.stopPropagation();
		};

		this.closeButton.onmousedown =
			this.maximizeButton.onmousedown =
			this.minimizeButton.onmousedown =
			this.popOutButton.onmousedown =
			event=> {
				WIN.controlPressed = this;
				this.BringToFront();
				event.stopPropagation();
			};

		this.closeButton.onmouseup = event=> { if (event.button === 0 && WIN.controlPressed === this) { WIN.controlPressed = null; this.Close(); } };
		this.maximizeButton.onmouseup = event=> { if (event.button === 0 && WIN.controlPressed === this) { WIN.controlPressed = null; this.Toggle(); } };
		this.minimizeButton.onmouseup = event=> { if (event.button === 0 && WIN.controlPressed === this) { WIN.controlPressed = null; this.Minimize(); } };
		this.popOutButton.onmouseup = event=> { if (event.button === 0 && WIN.controlPressed === this) { WIN.controlPressed = null; this.PopOut(); } };

		this.SetTitle("untitled");
		WIN.array.push(this);

		this.BringToFront();

		WIN.AlignIcon(false);

		if (onMobile || WIN.alwaysMaxed) this.Toggle();
	}

	Close() {
		if (this.isClosed) return;
		this.isClosed = true;

		document.getSelection().removeAllRanges();

		this.win.style.transition = `${WIN.ANIME_DURATION / 1333}s`;
		this.win.style.opacity = "0";
		this.win.style.transform = "scale(.85)";

		this.task.style.transition = `${WIN.ANIME_DURATION / 2000}s`;
		this.task.style.opacity = "0";
		this.task.style.transform = "scale(.85)";

		setTimeout(()=> {
			if (this.popOutWindow) {
				this.popOutWindow.close();
			}
			else {
				container.removeChild(this.win);
			}

			taskbar.removeChild(this.task);
			WIN.array.splice(WIN.array.indexOf(this), 1);
			WIN.AlignIcon(false);
		}, WIN.ANIME_DURATION / 2);

		WIN.focused = null;

		MENU.history.push({
			title: this.header.textContent,
			icon: this.icon.style.backgroundImage,
			class: this.constructor.name,
			args: this.args
		});

		if (MENU.isOpen && MENU.filterIndex === 1) {
			setTimeout(()=>MENU.Update(), WIN.ANIME_DURATION);
		}
	}

	Toggle() {
		document.getSelection().removeAllRanges();

		this.win.style.transition = WIN.ANIME_DURATION / 1000 + "s";

		if (this.isMaximized) {
			if (this.position === null) {
				this.win.style.left = "20%";
				this.win.style.top = "20%";
				this.win.style.width = "40%";
				this.win.style.height = "40%";
			}
			else {
				this.win.style.left = this.position[0];
				this.win.style.top = this.position[1];
				this.win.style.width = this.position[2];
				this.win.style.height = this.position[3];
			}

			this.content.style.left = "4px";
			this.content.style.right = "4px";
			this.content.style.top = this.toolbar ? "76px" : "32px";
			this.content.style.bottom = "4px";

			this.win.style.borderRadius = "8px 8px 0 0";
			this.resize.style.visibility = "visible";
			this.isMaximized = false;

			if (this.toolbar && !this.popOutWindow) {
				this.toolbar.style.top = "32px";
			}
		}
		else {
			this.position = [this.win.style.left, this.win.style.top, this.win.style.width, this.win.style.height];
			this.win.style.left = "0%";
			this.win.style.top = "0%";
			this.win.style.width = "100%";
			this.win.style.height = "100%";

			this.content.style.left = "0";
			this.content.style.right = "0";
			this.content.style.top = this.toolbar ? "82px" : "38px";
			this.content.style.bottom = "0";

			this.win.style.borderRadius = "0";
			this.resize.style.visibility = "hidden";
			this.isMaximized = true;

			if (this.toolbar) {
				this.toolbar.style.top = "38px";
			}
		}

		setTimeout(()=> {
			this.win.style.transition = "0s";
			this.AfterResize();
		}, WIN.ANIME_DURATION);
	}

	Minimize(force) {
		document.getSelection().removeAllRanges();

		let isFocused = (WIN.count == this.win.style.zIndex);
		this.win.style.transition = `${WIN.ANIME_DURATION / 1000}s`;

		if (this.isMinimized && !force) { //restore
			this.win.style.opacity = "1";
			this.win.style.visibility = "visible";
			this.win.style.transform = "none";
			this.isMinimized = false;
			setTimeout(()=> this.BringToFront(), WIN.ANIME_DURATION / 2);

			WIN.focused = this;
		}
		else if (!isFocused && !force) { //pop
			this.Pop();
		}
		else { //minimize
			if (this.popOutWindow) return;

			let iconX = this.task.getBoundingClientRect().x - this.win.offsetLeft - this.win.clientWidth / 2;
			let iconY = this.task.getBoundingClientRect().y - this.win.offsetTop - this.win.clientHeight / 2;

			this.win.style.opacity = "0";
			this.win.style.visibility = "hidden";
			this.win.style.transform = `scale(.6) translateX(${iconX}px) translateY(${iconY}px)`;
			this.isMinimized = true;

			this.task.className = "bar-icon";
			this.task.style.backgroundColor = "transparent";
			this.icon.style.filter = "none";

			WIN.focused = null;
		}

		setTimeout(()=> { this.win.style.transition = "0s"; }, WIN.ANIME_DURATION);
	}

	Pop() {
		if (this.isMinimized) {
			this.Minimize(); //minimize/restore
		}
		else {
			if (!this.isMaximized) this.win.style.animation = "focus-pop .2s";
			this.BringToFront();
			setTimeout(()=> { this.win.style.animation = "none" }, 200);
		}
	}

	PopOut() {
		document.getSelection().removeAllRanges();

		//close any open dialog box
		const dialog = this.win.getElementsByClassName("win-dim")[0];
		if (dialog != null) {
			this.win.removeChild(dialog);
			this.content.style.filter = "none";
		}

		let newWin = window.open(
			"", "",
			`width=${this.win.clientWidth},height=${this.win.clientHeight},left=${window.screenX + this.win.offsetLeft},top=${window.screenY + this.win.offsetTop}`);

		newWin.document.write(`<title>${WIN.EscapeHtml(this.header.textContent)}</title>`);
		newWin.document.write(`<link rel='icon' href='${this.iconPath}' media='(prefers-color-scheme:light)'>`);
		newWin.document.write(`<link rel='icon' href='${this.iconPath}?light' media='(prefers-color-scheme:dark)'>`);
		newWin.document.write("<link rel='stylesheet' href='root.css'>");

		for (let i = 0; i < LOADER.baseStyles.length; i++)
			newWin.document.write(`<link rel='stylesheet' href='${LOADER.baseStyles[i]}'>`);

		for (let i = 0; i < this.cssDependencies.length; i++)
			newWin.document.write(`<link rel='stylesheet' href='${this.cssDependencies[i]}'>`);


		newWin.document.close();

		newWin.document.body.style.background = "none";
		newWin.document.body.style.backgroundColor = "rgb(64,64,64)";
		newWin.document.body.style.padding = "0";
		newWin.document.body.style.margin = "0";

		if (localStorage.getItem("accent_color")) { //apply accent color
			let accent = JSON.parse(localStorage.getItem("accent_color"));
			let hsl = UI.RgbToHsl(accent);
			let select = `hsl(${hsl[0] + 7},${hsl[1]}%,${hsl[2] * .9}%)`;
			newWin.document.querySelector(":root").style.setProperty("--clr-accent", `rgb(${accent[0]},${accent[1]},${accent[2]})`);
			newWin.document.querySelector(":root").style.setProperty("--clr-select", select);
		}

		this.popOutWindow = newWin;
		container.removeChild(this.win);

		const popInButton = document.createElement("input");
		popInButton.type = "button";
		popInButton.style.padding = "0";
		popInButton.style.margin = "0";
		popInButton.style.minWidth = "0";
		popInButton.style.position = "absolute";
		popInButton.style.width = this.toolbar ? "24px" : "22px";
		popInButton.style.height = this.toolbar ? "24px" : "22px";
		popInButton.style.right = this.toolbar ? "4px" : "2px";
		popInButton.style.top = this.toolbar ? "8px" : "2px";
		popInButton.style.backgroundColor = "var(--clr-light)";
		popInButton.style.backgroundImage = "url(controls/popout.svg)";
		popInButton.style.backgroundPosition = "center";
		popInButton.style.borderRadius = "12px";

		this.content.style.left = "0";
		this.content.style.right = "0";
		this.content.style.top = this.toolbar ? "48px" : "26px";
		this.content.style.bottom = "0";
		newWin.document.body.appendChild(this.content);

		if (this.toolbar) {
			toolbar = this.toolbar;
			this.toolbar.style.top = "4px";
			newWin.document.body.appendChild(this.toolbar);
			this.toolbar.appendChild(popInButton);
		}
		else {
			newWin.document.body.appendChild(popInButton);
		}

		this.content.style.filter = "none";

		newWin.onresize = ()=> this.AfterResize();

		popInButton.onclick = ()=> {
			container.appendChild(this.win);
			this.win.appendChild(this.content);

			newWin.onbeforeunload = ()=> { };
			newWin.close();
			this.popOutWindow = null;

			this.content.style.filter = "none";

			this.content.style.left = this.isMaximized ? "0" : "4px";
			this.content.style.right = this.isMaximized ? "0" : "4px";
			this.content.style.top = this.isMaximized ? "38px" : "32px";
			this.content.style.bottom = this.isMaximized ? "0" : "4px";

			if (this.toolbar) {
				this.toolbar.removeChild(popInButton);
				this.win.appendChild(this.toolbar);
				this.toolbar.style.top = this.isMaximized ? "38px" : "32px";
				this.content.style.top = this.isMaximized ? "82px" : "76px";
			}

			this.AfterResize();
		};

		newWin.onbeforeunload = ()=> this.Close();

		return popInButton;
	}

	BringToFront() {
		if (this.win.style.zIndex != WIN.count && !document.getSelection().isCollapsed)
			document.getSelection().removeAllRanges();

		for (let i = 0; i < WIN.array.length; i++) {
			WIN.array[i].task.className = "bar-icon";
			WIN.array[i].task.style.backgroundColor = "rgba(0,0,0,0)";
			WIN.array[i].icon.style.filter = "none";
		}

		this.task.className = "bar-icon bar-icon-focused";
		this.task.style.backgroundColor = "rgb(64,64,64)";
		this.icon.style.filter = "brightness(6)";

		if (this.popOutWindow) {
			this.popOutWindow.focus();
			return;
		}

		if (this.win.style.zIndex < WIN.count) this.win.style.zIndex = ++WIN.count;

		WIN.focused = this;
	}

	ConfirmBox(message, okOnly=false, icon=null) {
		//if a dialog is already open, queue
		if (this.popOutWindow) {
			if (this.popOutWindow.document.body.getElementsByClassName("win-dim")[0] != null) {
				this.messagesQueue.push([message, okOnly, icon]);
				return null;
			}
		}
		else {
			document.getSelection().removeAllRanges();
			if (this.win.getElementsByClassName("win-dim")[0] != null) {
				this.messagesQueue.push([message, okOnly, icon]);
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

		okButton.onkeydown = event=>{
			if (event.key === "ArrowRight") { cancelButton.focus(); }
		};

		cancelButton.onkeydown = event=>{
			if (event.key === "ArrowLeft") { okButton.focus(); }
		};

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
				if (this.popOutWindow) {
					this.popOutWindow.document.body.removeChild(dim);
				}
				else {
					this.win.removeChild(dim);
				}

				let next = this.messagesQueue.shift();
				if (next) this.ConfirmBox(next[0], next[1], next[2]);
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
			if (this.popOutWindow) {
				this.popOutWindow.document.body.removeChild(dim);
			}
			else {
				this.win.removeChild(dim);
			}
		};

		let once = false;
		const Close = ()=> {
			if (once) return;
			once = true;
			dim.style.filter = "opacity(0)";
			dialogBox.style.transform = "scaleY(.2)";
			this.content.style.filter = "none";
			setTimeout(()=> Abort(), WIN.ANIME_DURATION);
			if (this.defaultElement) {
				this.defaultElement.focus();
			}
		};

		okButton.onkeydown = event=> {
			if (event.key === "ArrowRight") { cancelButton.focus(); }
			if (event.key === "Escape") { Close(); }
		};

		cancelButton.onkeydown = event=> {
			if (event.key === "ArrowLeft") { okButton.focus(); }
			if (event.key === "Escape") { Close(); }
		};

		innerBox.onkeydown = event=>{
			if (event.key === "Escape") {
				cancelButton.onclick();
			}
		};

		cancelButton.onclick = ()=> Close();
		okButton.onclick = event=> cancelButton.onclick(event);

		return {
			okButton: okButton,
			cancelButton: cancelButton,
			innerBox: innerBox,
			buttonBox: buttonBox,
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

	SetupToolbar() {
		this.toolbar = document.createElement("div");
		this.toolbar.className = "win-toolbar";
		this.toolbar.setAttribute("role", "toolbar");
		this.win.appendChild(this.toolbar);

		if (this.isMaximized) {
			this.toolbar.style.top = "38px";
			this.content.style.top = "82px";
		}
		else {
			this.toolbar.style.top = "32px";
			this.content.style.top = "76px";
		}

		this.toolbar.onmousedown = event=> {
			if (!this.popOutWindow) this.BringToFront();
			event.stopPropagation();
		};
	}

	AddToolbarButton(tooltip, icon) {
		const newButton = document.createElement("button");
		newButton.className = "win-toolbar-button";
		newButton.style.backgroundImage = `url(${icon})`;
		if (this.toolbar) this.toolbar.appendChild(newButton);

		if (tooltip) {
			newButton.setAttribute("tip-below", tooltip);
			newButton.setAttribute("aria-label", tooltip);
		}

		newButton.addEventListener("focus", ()=>this.BringToFront());

		return newButton;
	}

	AddToolbarDropdown(icon) {
		//if (!this.toolbar) return null;
		const button = this.AddToolbarButton(null, icon);

		const menu = document.createElement("div");
		menu.className = "win-toolbar-submenu";
		button.appendChild(menu);

		const list = document.createElement("div");
		list.style.top = "0";
		menu.appendChild(list);

		button.addEventListener("focus", ()=> {
			if (this.popOutWindow) {
				menu.style.maxHeight = `${this.content.clientHeight - 32}px`;
			}
			else {
				menu.style.maxHeight = `${container.clientHeight - this.win.offsetTop - 96}px`;
			}
		});

		return { button: button, menu: menu, list: list };
	}

	AddToolbarSeparator() {
		const newSeparator = document.createElement("div");
		newSeparator.className = "win-toolbar-separator";
		if (this.toolbar) this.toolbar.appendChild(newSeparator);
		return newSeparator;
	}

	AddSendToChatButton() {
		this.sendChatButton = this.AddToolbarButton("Send to chat", "mono/send.svg?light");

		this.sendChatButton.onclick = ()=> {
			this.ConfirmBox("Are you sure you want to send this to team chat?", false, "mono/send.svg").addEventListener("click", ()=> {
					KEEP.socket.send(JSON.stringify({
						type: "chat-command",
						command: this.constructor.name,
						args: JSON.stringify(this.args),
						icon: this.iconPath,
						title: this.header.textContent,
						id: `${KEEP.username}${Date.now()}`
				}));
			});
		};
	}

	SetTitle(title = "") {
		this.header.textContent = title;
		this.task.setAttribute("tip", title);
	}

	SetIcon(iconPath) {
		this.icon.style.backgroundImage = `url(${iconPath})`;
		this.titleIcon.style.backgroundImage = `url(${iconPath})`;
		this.iconPath = iconPath;
	}

	AfterResize() { } //overridable

	UpdateAuthorization() { //overridable
		if (this.sendChatButton) {
			if (KEEP.authorization.includes("*") || KEEP.authorization.includes("chat:write")) {
				this.sendChatButton.disabled = false;
			}
			else {
				this.sendChatButton.disabled = true;
			}
		}
	}

	CreateToggle(text, value, parent) {
		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.checked = value;

		parent.appendChild(checkbox);
		const label = this.AddCheckBoxLabel(parent, checkbox, text);

		return {checkbox: checkbox, label: label};
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
		if (document.head.querySelectorAll(`link[href$='${filename}']`).length === 0) {
			const cssLink = document.createElement("link");
			cssLink.rel = "stylesheet";
			cssLink.href = filename;
			document.head.appendChild(cssLink);
		}

		if (!this.cssDependencies.includes(filename)) {
			this.cssDependencies.push(filename);
		}
	}
}