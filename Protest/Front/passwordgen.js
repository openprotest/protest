class PassGen extends Window {
	constructor() {
		super();

		this.SetTitle("Password generator");
		this.SetIcon("mono/passgen.svg");

		this.content.style.padding = "32px 16px 0 16px";
		this.content.style.overflowY = "auto";
		this.content.style.textAlign = "center";

		this.passwordInput = document.createElement("input");
		this.passwordInput.type = "text";
		this.passwordInput.maxLength = "64";
		this.passwordInput.style.fontSize = "larger";
		this.passwordInput.style.width = "60%";
		this.passwordInput.style.maxWidth = "720px";
		this.passwordInput.style.margin = "2px calc(20% - 32px)";
		this.passwordInput.style.fontFamily = "monospace";
		this.content.appendChild(this.passwordInput);

		this.strengthBox = document.createElement("div");
		this.strengthBox.style.marginTop = "4px";
		this.strengthBox.style.marginTop = "4px";
		this.strengthBox.style.marginTop = "4px";
		this.content.appendChild(this.strengthBox);

		this.strengthBar = document.createElement("div");
		this.strengthBar.className = "passwors-strength-bar";
		this.strengthBar.style.display = "inline-block";
		this.strengthBar.style.width = "40px";
		this.strengthBar.style.height = "12px";
		this.strengthBar.style.transition = "box-shadow .2s";
		this.strengthBar.style.border = "1px solid rgb(127,127,127)";
		this.strengthBar.style.borderRadius = "2px";
		this.strengthBox.appendChild(this.strengthBar);

		this.commentLabel = document.createElement("div");
		this.commentLabel.style.display = "inline-block";
		this.commentLabel.style.minWidth = "100px";
		this.commentLabel.style.textAlign = "left";
		this.commentLabel.style.marginLeft = "8px";
		this.commentLabel.style.marginTop = "0px";
		this.strengthBox.appendChild(this.commentLabel);

		const grid = document.createElement("div");
		grid.style.display = "grid";
		grid.style.width = "480px";
		grid.style.margin = "40px auto 20px auto";
		grid.style.padding = "40px";
		grid.style.backgroundColor = "var(--clr-pane)";
		grid.style.color = "var(--clr-dark)";
		grid.style.fontWeight = "600";
		grid.style.borderRadius = "4px";
		grid.style.gridTemplateColumns = "210px 110px 180px";
		grid.style.gridTemplateRows = "40px repeat(5, 32px)";
		grid.style.alignItems = "center";
		this.content.appendChild(grid);

		this.cmbOptions = document.createElement("select");
		this.cmbOptions.style.margin = "0 80px 12px 80px";
		this.cmbOptions.style.gridArea = "1 / 1 / auto / 3";
		grid.appendChild(this.cmbOptions);

		let pinOption = document.createElement("option");
		pinOption.value = "pin";
		pinOption.text = "Pin";
		this.cmbOptions.appendChild(pinOption);

		let randomOption = document.createElement("option");
		randomOption.value = "rnd";
		randomOption.text = "Random";
		this.cmbOptions.appendChild(randomOption);

		this.cmbOptions.value = "rnd";

		let lengthLabel = document.createElement("div");
		lengthLabel.textContent = "Length:";
		lengthLabel.style.textDecoration = "underline";
		lengthLabel.style.width = "100%";
		lengthLabel.style.marginBottom = "4px";
		lengthLabel.style.textAlign = "left";
		lengthLabel.style.gridArea = "2 / 1";
		grid.appendChild(lengthLabel);

		this.lengthRange = document.createElement("input");
		this.lengthRange.type = "range";
		this.lengthRange.min = "6";
		this.lengthRange.max = this.passwordInput.maxLength;
		this.lengthRange.value = "16";
		this.lengthRange.style.width = "200px";
		this.lengthRange.style.float = "left";
		this.lengthRange.style.gridArea = "3 / 1";
		grid.appendChild(this.lengthRange);

		this.lengthInput = document.createElement("input");
		this.lengthInput.type = "number";
		this.lengthInput.min = this.lengthRange.min;
		this.lengthInput.max = this.passwordInput.maxLength;
		this.lengthInput.value = this.lengthRange.value;
		this.lengthInput.style.width = "48px";
		this.lengthInput.style.gridArea = "3 / 2";
		grid.appendChild(this.lengthInput);

		const lowercaseBox = document.createElement("div");
		lowercaseBox.style.textAlign = "left";
		lowercaseBox.style.gridArea = "2 / 3";
		grid.appendChild(lowercaseBox);
		this.lowercaseToggle = this.CreateToggle("Lowercase", true, lowercaseBox);

		const uppercaseBox = document.createElement("div");
		uppercaseBox.style.textAlign = "left";
		uppercaseBox.style.gridArea = "3 / 3";
		grid.appendChild(uppercaseBox);
		this.uppercaseToggle = this.CreateToggle("Uppercase", true, uppercaseBox);

		const numbersBox = document.createElement("div");
		numbersBox.style.textAlign = "left";
		numbersBox.style.gridArea = "4 / 3";
		grid.appendChild(numbersBox);
		this.numbersToggle = this.CreateToggle("Numbers", true, numbersBox);

		const symbolsBox = document.createElement("div");
		symbolsBox.style.textAlign = "left";
		symbolsBox.style.gridArea = "5 / 3";
		grid.appendChild(symbolsBox);
		this.symbolsToggle = this.CreateToggle("Symbols", true, symbolsBox);

		const similarBox = document.createElement("div");
		similarBox.style.textAlign = "left";
		similarBox.style.gridArea = "6 / 3";
		grid.appendChild(similarBox);
		this.similarToggle = this.CreateToggle("Similar", true, similarBox);

		const entropyLabel = document.createElement("div");
		entropyLabel.textContent = "Entropy (bits):";
		entropyLabel.style.gridArea = "4 / 1";
		entropyLabel.style.textAlign = "right";
		entropyLabel.style.paddingRight = "4px";
		entropyLabel.style.color = "#808080";
		grid.appendChild(entropyLabel);

		this.entropyValueLabel = document.createElement("div");
		this.entropyValueLabel.style.gridArea = "4 / 2";
		this.entropyValueLabel.style.textAlign = "left";
		this.entropyValueLabel.style.fontWeight = "normal";
		this.entropyValueLabel.style.paddingLeft = "12px";
		this.entropyValueLabel.style.color = "#808080";
		grid.appendChild(this.entropyValueLabel);

		this.lengthRange.oninput = ()=> {
			this.lengthInput.value = this.lengthRange.value;
			this.Generate();
		};

		this.lengthInput.oninput = ()=> {
			this.lengthRange.value = this.lengthInput.value;
			this.Generate();
		};

		let buttonsBox = document.createElement("div");
		buttonsBox.style.display = "grid";
		buttonsBox.style.gridTemplateColumns = "auto 100px 64px 64px auto";
		buttonsBox.style.gridTemplateRows = "1fr";
		buttonsBox.style.width = "100%";
		buttonsBox.style.textAlign = "center";
		buttonsBox.style.paddingTop = "32px";
		buttonsBox.style.gridArea = "5 / 1 / 7 / 3";
		grid.appendChild(buttonsBox);

		const generateButton = document.createElement("input");
		generateButton.type = "button";
		generateButton.value = "Generate";
		generateButton.style.gridArea = "1 / 2";
		buttonsBox.appendChild(generateButton);

		const copyButton = document.createElement("input");
		copyButton.type = "button";
		copyButton.style.backgroundImage = "url(mono/copy.svg?light)";
		copyButton.style.backgroundSize = "28px 28px";
		copyButton.style.backgroundPosition = "50% 50%";
		copyButton.style.backgroundRepeat = "no-repeat";
		copyButton.style.minWidth = "56px";
		copyButton.style.gridArea = "1 / 3";
		buttonsBox.appendChild(copyButton);

		const stampButton = document.createElement("input");
		stampButton.type = "button";
		stampButton.value = " ";
		stampButton.style.backgroundImage = "url(mono/stamp.svg?light)";
		stampButton.style.backgroundSize = "28px 28px";
		stampButton.style.backgroundPosition = "50% 50%";
		stampButton.style.backgroundRepeat = "no-repeat";
		stampButton.style.minWidth = "56px";
		stampButton.style.gridArea = "1 / 4";
		buttonsBox.appendChild(stampButton);

		generateButton.style.height = copyButton.style.height = stampButton.style.height = "40px";
		generateButton.style.margin = copyButton.style.margin = stampButton.style.margin = "2px";

		generateButton.style.borderRadius = "4px 0 0 4px";
		copyButton.style.borderRadius = "0 0 0 0";
		stampButton.style.borderRadius = "0 4px 4px 0";

		this.ttcLabel = document.createElement("div");
		this.ttcLabel.style.color = "var(--clr-light)";
		this.ttcLabel.style.whiteSpace = "nowrap";
		this.content.appendChild(this.ttcLabel);

		this.cmbOptions.onchange = ()=> {
			switch (this.cmbOptions.value) {
			case "pin":
				this.lengthRange.min = 4;
				this.lengthRange.value = 4;
				this.lengthRange.max = 64;
				this.numbersToggle.checkbox.checked = true;
				this.lowercaseToggle.checkbox.checked = false;
				this.uppercaseToggle.checkbox.checked = false;
				this.symbolsToggle.checkbox.checked = false;
				this.similarToggle.checkbox.checked = false;
				this.lowercaseToggle.checkbox.disabled = true;
				this.uppercaseToggle.checkbox.disabled = true;
				this.numbersToggle.checkbox.disabled = true;
				this.symbolsToggle.checkbox.disabled = true;
				this.similarToggle.checkbox.disabled = true;
				lengthLabel.textContent = "Length:";
				break;

			case "rnd":
				this.lengthRange.value = 16;
				this.lengthRange.min = 6;
				this.lengthRange.max = 64;
				this.lowercaseToggle.checkbox.checked = true;
				this.uppercaseToggle.checkbox.checked = true;
				this.numbersToggle.checkbox.checked = true;
				this.symbolsToggle.checkbox.checked = false;
				this.similarToggle.checkbox.checked = false;
				this.lowercaseToggle.checkbox.disabled = false;
				this.uppercaseToggle.checkbox.disabled = false;
				this.numbersToggle.checkbox.disabled = false;
				this.symbolsToggle.checkbox.disabled = false;
				this.similarToggle.checkbox.disabled = false;
				lengthLabel.textContent = "Length:";
				break;

			case "mem":
				this.lengthRange.min = 2;
				this.lengthRange.value = 4;
				this.lengthRange.max = 32;
				this.lowercaseToggle.checkbox.checked = true;
				this.uppercaseToggle.checkbox.checked = false;
				this.numbersToggle.checkbox.checked = false;
				this.symbolsToggle.checkbox.checked = false;
				this.similarToggle.checkbox.checked = false;
				this.lowercaseToggle.checkbox.disabled = false;
				this.uppercaseToggle.checkbox.disabled = false;
				this.numbersToggle.checkbox.disabled = false;
				this.symbolsToggle.checkbox.disabled = true;
				this.similarToggle.checkbox.disabled = true;
				lengthLabel.textContent = "Words:";
				break;
			}

			this.lengthInput.min = this.lengthRange.min;
			this.lengthInput.value = this.lengthRange.value;

			this.Generate();
		};

		this.lowercaseToggle.checkbox.onchange = this.uppercaseToggle.checkbox.onchange = this.numbersToggle.checkbox.onchange = this.symbolsToggle.checkbox.onchange = this.similarToggle.checkbox.onchange = ()=> this.Generate();

		generateButton.onclick = ()=> this.Generate();

		copyButton.onclick = ()=> {
			try {
				navigator.clipboard.writeText(this.passwordInput.value);

				if (copyButton.style.animation === "") {
					copyButton.style.animation = "bg-roll-up .6s linear";
					setTimeout(()=>copyButton.style.animation = "", 600);
				}
			}
			catch {
				this.ConfirmBox(ex, true, "mono/error.svg");
			}
		};

		stampButton.onclick = ()=> {
			if (this.passwordInput.value.length < 1) return;
			UI.PromptAgent(this, "stamp", this.passwordInput.value);

			if (stampButton.style.animation === "") {
				stampButton.style.animation = "bg-stamp .6s linear";
				setTimeout(()=>stampButton.style.animation = "", 600);
			}
		};

		this.passwordInput.oninput = ()=> {
			if (this.cmbOptions.value === "mem") {
				let phrase = this.passwordInput.value.split("-");
				this.lengthRange.value = phrase.length;
				this.lengthInput.value = phrase.length;
				return;
			}

			let word = this.passwordInput.value;

			this.lengthRange.value = word.length;
			this.lengthInput.value = word.length;

			let hasUppercase = false;
			let hasLowercase = false;
			let hasNumbers = false;
			let hasSymbols = false;

			for (let i = 0; i < word.length; i++) {
				let b = word.charCodeAt(i);
				if (b > 47 && b < 58) hasNumbers = true;
				else if (b > 64 && b < 91) hasUppercase = true;
				else if (b > 96 && b < 123) hasLowercase = true;
				else hasSymbols = true;
			}

			this.lowercaseToggle.checkbox.checked = hasLowercase;
			this.uppercaseToggle.checkbox.checked = hasUppercase;
			this.numbersToggle.checkbox.checked = hasNumbers;
			this.symbolsToggle.checkbox.checked = hasSymbols;

			this.Strength();
		};

		this.cmbOptions.onchange();
		this.Generate();

		this.LoadWords();
	}

	async LoadWords() {
		try {
			const response = await fetch("words.txt");

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const words = await response.text();
			if (words.error) throw (json.error);

			if (words.length > 2) this.words = words.split("\n");

			let memorableOption = document.createElement("option");
			memorableOption.value = "mem";
			memorableOption.text = "Memorable";
			this.cmbOptions.appendChild(memorableOption);

		}
		catch {}
	}

	Generate() {
		if (!this.lowercaseToggle.checkbox.checked && !this.uppercaseToggle.checkbox.checked && !this.numbersToggle.checkbox.checked && !this.symbolsToggle.checkbox.checked)
			this.lowercaseToggle.checkbox.checked = true;

		if (this.cmbOptions.value === "mem") {
			let word = "";
			if (this.words)
				for (let i = 0; i < this.lengthRange.value; i++) {
					if (this.lowercaseToggle.checkbox.checked && this.uppercaseToggle.checkbox.checked) {
						let w = this.words[Math.round(Math.random() * this.words.length)];
						word += w[0].toUpperCase() + w.substring(1);
					}
					else if (this.uppercaseToggle.checkbox.checked){
						word += this.words[Math.round(Math.random() * this.words.length)].toUpperCase();
					}
					else {
						word += this.words[Math.round(Math.random() * this.words.length)];
					}

					if (i+1 < this.lengthRange.value)word += "-";
				}

			if (this.numbersToggle.checkbox.checked) {
				let temp = word;
				word = "";
				for (let i = 0; i < temp.length; i++)
					if (Math.random() > .4) {
						let c = temp[i].toLowerCase();

						if (c === "i") word += "1";
						else if (c === "e") word += "3";
						else if (c === "a") word += "4";
						else if (c === "s") word += "5";
						else if (c === "t") word += "7";
						else word += temp[i];

					}
					else {
						word += temp[i];
					}
			}

			this.passwordInput.value = word;
			this.Strength();
			return;
		}

		let pool = [];
		let flag = [];

		if (this.lowercaseToggle.checkbox.checked) {
			pool.push(this.similarToggle.checkbox.checked ? "abcdefghijklmnopqrstuvwxyz" : "abcdefghijkmnpqrstuvwxyz");
			flag.push(false);
		}

		if (this.uppercaseToggle.checkbox.checked) {
			pool.push(this.similarToggle.checkbox.checked ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ" : "ABCDEFGHJKLMNPQRSTUVWXYZ");
			flag.push(false);
		}

		if (this.symbolsToggle.checkbox.checked) {
			pool.push("!#$%&()*+-<=>?@^_~,./[\\]{}");
			flag.push(false);
		}

		if (this.numbersToggle.checkbox.checked) {
			pool.push(this.similarToggle.checkbox.checked ? "0123456789" : "23456789");
			flag.push(false);
		}

		let word = "";
		for (let i=0; i<this.lengthRange.value; i++) {
			let dice = Math.round(Math.random() * (pool.length + 1));
			if (dice < pool.length) {
				word += pool[dice][Math.round(Math.random() * (pool[dice].length - 1))];
				flag[dice] = true;
			}
			else {
				let ok = false;

				for (let j=0; j<flag.length; j++)
					if (!flag[j]) {
						word += pool[j][Math.round(Math.random() * (pool[j].length - 1))];
						flag[j] = true;
						ok = true;
						break;
					}

				if (!ok) {
					dice = Math.round(Math.random() * (pool.length - 1));
					word += pool[dice][Math.round(Math.random() * (pool[dice].length - 1))];
					flag[dice] = true;
				}
			}
		}

		this.passwordInput.value = word;
		this.Strength();
	}

	Strength() {
		let pool = 0;
		if (this.numbersToggle.checkbox.checked) pool += 10;
		if (this.uppercaseToggle.checkbox.checked) pool += 26;
		if (this.lowercaseToggle.checkbox.checked) pool += 26;
		if (this.symbolsToggle.checkbox.checked) pool += 30;

		let entropy = Math.log(pool, 2) * this.passwordInput.value.length;
		//same as     Math.log(pool ** this.passwordInput.value.length, 2));

		let strength = PassGen.StrengthBar(entropy);
		let color = strength[0];
		let fill = strength[1];
		let comment = strength[2];

		this.strengthBar.style.boxShadow = `${color} ${Math.round(fill)}px 0 0 inset`;
		this.commentLabel.textContent = comment;
		this.entropyValueLabel.textContent = Math.round(entropy);

		let combinations = pool ** this.passwordInput.value.length;
		let ttc = combinations / 350000000000; //time to crack in seconds

		let eon = Math.floor(ttc / (1000000000 * 365 * 24 * 3600));
		ttc -= eon * 1000000000 * 365 * 24 * 3600;

		let years = Math.floor(ttc / (365 * 24 * 3600));
		ttc -= years * (365 * 24 * 3600);

		let days = Math.floor(ttc / (24 * 3600));
		ttc -= days * (24 * 3600);

		let hours = Math.floor(ttc / 3600);
		ttc -= hours * 3600;

		let minutes = Math.floor(ttc / 60);
		ttc -= minutes * 60;

		let seconds = Math.round(ttc);

		let etc = ""; //Estimated Time to Crack
		if (eon != 0)     etc  = eon === 1     ? "1 eon, "    : `${eon} eons, `;
		if (years != 0)   etc += years === 1   ? "1 year, "   : `${years} years, `;
		if (days != 0)    etc += days === 1    ? "1 day, "    : `${days} days, `;
		if (hours != 0)   etc += hours === 1   ? "1 hour, "   : `${hours} hours, `;
		if (minutes != 0) etc += minutes === 1 ? "1 minute, " : `${minutes} minutes, `;

		if (seconds != 0) {
			if (etc.length === 0) {
				etc += seconds === 1 ? "a second" : `${seconds} seconds`;
			}
			else {
				etc += seconds === 1 ? "and 1 second" : `and ${seconds} seconds`;
			}
		}

		if (etc.length === 0) etc = "less then a second";

		if (eon > 999999999999999) {
			this.ttcLabel.textContent = "TTC: Infinity";
		}
		else {
			this.ttcLabel.textContent = `TTC: ${etc}`;
		}
	}

	static StrengthBar(entropy) {
		let comment = "";
		let color = "";

		if (entropy < 19) {
			comment = "Forbidden";
			color = "#f00";
		}
		else if (entropy < 28) {
			comment = "Very weak";
			color = "#d00";
		}
		else if (entropy < 36) {
			comment = "Weak";
			color = "#d70";
		}
		else if (entropy < 60) {
			comment = "Reasonable";
			color = "#dc0";
		}
		else if (entropy < 128) {
			comment = "Strong";
			color = "#8c2";
		}
		else {
			comment = "Overkill";
			color = "#07d";
		}

		return [color, 32 * entropy / 96, comment];
	}
}