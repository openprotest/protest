class IpBox {
	constructor() {
		this.enterElement = null;
		this.exitElement = null;

		this.textBoxes = [];

		for (let i = 0; i < 4; i++) {
			this.textBoxes.push(document.createElement("input"));

			this.textBoxes[i].type = "text";
			this.textBoxes[i].value = "0";
			this.textBoxes[i].style.textAlign = "center";
			this.textBoxes[i].style.width = "38px";
			this.textBoxes[i].style.margin = "2px 1px";
			this.textBoxes[i].style.padding = "4px 2px";
			this.textBoxes[i].setAttribute("i", i + 1);

			this.textBoxes[i].onkeydown = event=> {
				if (event.key == "ArrowLeft" ||
					event.key == "ArrowRight" ||
					event.key == "Tab" ||
					event.key == "Shift") return;

				let ok = (
					event.ctrlKey ||
					event.key == "." || event.key == "0" ||
					event.key == "1" || event.key == "2" || event.key == "3" ||
					event.key == "4" || event.key == "5" || event.key == "6" ||
					event.key == "7" || event.key == "8" || event.key == "9" ||
					event.key == "F5" ||
					event.key == "Backspace" || event.key == "Delete" ||
					event.key == "End" || event.key == "Home" ||
					event.key == "ArrowUp" || event.key == "ArrowDown"
				);

				if (!ok) event.preventDefault();

				if (event.key == "ArrowUp" && !isNaN(event.target.value)) {
					event.preventDefault();
					let v = parseInt(event.target.value);
					if (v < 255) event.target.value = v + 1;
					return;
				}

				if (event.key == "ArrowDown" && !isNaN(event.target.value)) {
					event.preventDefault();
					let v = parseInt(event.target.value);
					if (v > 0) event.target.value = v - 1;
					return;
				}

				if (event.key == "Backspace")
					if (event.target.value.length == 0)
						this.FocusPrevious(event.target);
					else
						return; //continue with default behavior

				if (event.key == ".") {
					event.preventDefault();
					this.FocusNext(event.target);
				}

				if (event.target.selectionStart === 0 && event.target.selectionEnd === 4) {
					let v = parseInt(event.target.value);
					if (v == NaN) v = 0;
					if (v > 255) event.target.value = 255;
					if (!isNaN(event.key)) this.FocusNext(event.target);
				}
				else if (event.target.value.length > 3 && window.getSelection().toString().length <= 3) {
					event.target.value = 255;
					this.FocusNext(event.target);
				}
			};

			this.textBoxes[i].onchange = event=> {
				let v = parseInt(event.target.value);
				if (isNaN(v)) v = 0;
				if (v > 255) v = 255;
				event.target.value = v;
			};
		}

		this.textBoxes[0].style.borderRadius = "4px 0 0 4px";
		this.textBoxes[1].style.borderRadius = "0";
		this.textBoxes[2].style.borderRadius = "0";
		this.textBoxes[3].style.borderRadius = "0 4px 4px 0";
	}

	Attach(container) {
		container.style.whiteSpace = "nowrap";
		container.style.overflow = "hidden";

		for (let i = 0; i < 4; i++)
			container.appendChild(this.textBoxes[i]);
	}

	FocusNext(current) {
		if (current.getAttribute("i") == 1) { this.textBoxes[1].focus(); this.textBoxes[1].select(); }
		if (current.getAttribute("i") == 2) { this.textBoxes[2].focus(); this.textBoxes[2].select(); }
		if (current.getAttribute("i") == 3) { this.textBoxes[3].focus(); this.textBoxes[3].select(); }
		if (current.getAttribute("i") == 4 && this.exitElement != null) { this.exitElement.focus(); this.exitElement.select(); }
	}

	FocusPrevious(current) {
		if (current.getAttribute("i") == 1 && this.enterElement != null) this.enterElement.focus();
		if (current.getAttribute("i") == 2) { this.textBoxes[0].focus(); this.textBoxes[0].select(); }
		if (current.getAttribute("i") == 3) { this.textBoxes[1].focus(); this.textBoxes[1].select(); }
		if (current.getAttribute("i") == 4) { this.textBoxes[2].focus(); this.textBoxes[2].select(); }
	}

	GetIpArray() {
		return [
			parseInt(this.textBoxes[0].value),
			parseInt(this.textBoxes[1].value),
			parseInt(this.textBoxes[2].value),
			parseInt(this.textBoxes[3].value)];
	}

	GetIpDecimal() {
		let a = this.GetIpArray();
		return ((((((+a[0]) * 256) + (+a[1])) * 256) + (+a[2])) * 256) + (+a[3]);
	}

	GetIpString() {
		return this.textBoxes[0].value + "." + this.textBoxes[1].value + "." + this.textBoxes[2].value + "." + this.textBoxes[3].value;
	}

	SetIp(b1, b2, b3, b4) {
		this.textBoxes[0].value = parseInt(b1);
		this.textBoxes[1].value = parseInt(b2);
		this.textBoxes[2].value = parseInt(b3);
		this.textBoxes[3].value = parseInt(b4);
	}

	SetEnabled(option) {
		for (let i = 0; i < 4; i++) {
			this.textBoxes[i].disabled = !option;
		}
	}
}