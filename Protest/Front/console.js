class Console extends Window {
	constructor() {
		super();

		this.history = [];

		this.list = document.createElement("div");
		this.list.style.position = "absolute";
		this.list.style.overflowY = "auto";
		this.list.style.left = "0";
		this.list.style.right = "0";
		this.list.style.top = "0";
		this.list.style.bottom = "40px";
		this.list.className = "no-results";
		this.content.appendChild(this.list);

		this.inputBox = document.createElement("input");
		this.inputBox.type = "text";
		this.inputBox.placeholder = "hostname or ip";
		this.inputBox.style.position = "absolute";
		this.inputBox.style.left = "40px";
		this.inputBox.style.bottom = "40px";
		this.inputBox.style.width = "calc(100% - 80px)";
		this.inputBox.style.margin = "0";
		this.inputBox.style.border = "0";
		this.inputBox.style.boxSizing = "border-box";
		this.content.appendChild(this.inputBox);

		let historyIndex = -1;
		this.inputBox.onkeydown = event=> {
			if (event.key === "Enter") {
				if (this.inputBox.value.length === 0) return;
				this.Push(this.inputBox.value.trim().toLocaleLowerCase());
				this.list.scrollTop = this.list.scrollHeight;
				this.inputBox.value = "";
				event.preventDefault();
			}

			if (event.key === "ArrowUp" || event.key === "ArrowDown") {
				if (this.history.length === 0) return;

				if (event.key === "ArrowUp") historyIndex--;
				if (event.key === "ArrowDown") historyIndex++;

				if (historyIndex < 0) historyIndex = this.history.length - 1;
				historyIndex %= this.history.length;
				this.inputBox.value = this.history[historyIndex];

				event.preventDefault();

			}
			else if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
				historyIndex = -1;
			}
		};

		this.defaultElement = this.inputBox;
		this.inputBox.focus();

		this.inputBox.onfocus = ()=> this.BringToFront();
		this.escAction = ()=> { this.inputBox.value = ""; };
	}

	Push(command) { //overridable
		if (command === "") return;
		if (command === "!!" && this.history.length === 0) return false;

		if (command === "!!") {
			this.Push(this.history[this.history.length - 1]);
			return false;
		}

		this.inputBox.style.left = "8px";
		this.inputBox.style.bottom = "8px";
		this.inputBox.style.width = "calc(100% - 16px)";

		if (this.history.includes(command))
			this.history.splice(this.history.indexOf(command), 1);

		this.history.push(command);

		return true;
	}
}