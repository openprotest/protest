class Log extends Window {
	constructor(params) {
		super();

		this.params = params ? params : {
			autoScroll: true,
			opaque: true,
			onTop: false
		};

		this.last = null;
		this.hasEnded = false;
		this.isLoading = false;

		this.AddCssDependencies("list.css");

		this.SetTitle("Log");
		this.SetIcon("mono/log.svg");

		this.listTitle = document.createElement("div");
		this.listTitle.className = "list-title";
		this.listTitle.textContent = `${"Date".padEnd(23)} ${"User".padEnd(31)} ${"Action"}`;
		this.listTitle.style.fontFamily = "monospace";
		this.listTitle.style.lineHeight = "25px";
		this.listTitle.style.paddingLeft = "28px";
		this.listTitle.style.whiteSpace = "pre-wrap";
		this.listTitle.style.overflow = "hidden";
		this.content.appendChild(this.listTitle);

		this.list = document.createElement("div");
		this.list.className = "no-results";
		this.list.style.fontFamily = "monospace";
		this.list.style.position = "absolute";
		this.list.style.left = "0px";
		this.list.style.right = "0px";
		this.list.style.top = "26px";
		this.list.style.bottom = "28px";
		this.list.style.color = "var(--clr-dark)";
		this.list.style.backgroundColor = "var(--clr-pane)";
		this.list.style.overflowX = "hidden";
		this.list.style.overflowY = "scroll";
		this.list.style.userSelect = "text";
		this.content.appendChild(this.list);

		this.options = document.createElement("div");
		this.options.style.position = "absolute";
		this.options.style.bottom = "0px";
		this.options.style.left = "0px";
		this.options.style.right = "0px";
		this.options.style.height = "24px";
		this.options.style.overflow = "hidden";
		this.content.appendChild(this.options);

		const divAutoScroll = document.createElement("div");
		divAutoScroll.style.display = "inline-block";
		divAutoScroll.style.paddingRight = "32px";
		divAutoScroll.style.paddingBottom = "8px";
		this.options.appendChild(divAutoScroll);
		this.chkAutoScroll = document.createElement("input");
		this.chkAutoScroll.type = "checkbox";
		this.chkAutoScroll.checked = this.params.autoScroll;
		divAutoScroll.appendChild(this.chkAutoScroll);
		this.AddCheckBoxLabel(divAutoScroll, this.chkAutoScroll, "Auto-scroll");

		this.divOpaque = document.createElement("div");
		this.divOpaque.style.display = "inline-block";
		this.divOpaque.style.paddingRight = "32px";
		this.divOpaque.style.paddingBottom = "8px";
		this.options.appendChild(this.divOpaque);
		this.chkOpaque = document.createElement("input");
		this.chkOpaque.type = "checkbox";
		this.chkOpaque.checked = this.params.opaque;
		this.divOpaque.appendChild(this.chkOpaque);
		this.AddCheckBoxLabel(this.divOpaque, this.chkOpaque, "Opaque");

		this.divOnTop = document.createElement("div");
		this.divOnTop.style.display = "inline-block";
		this.divOnTop.style.paddingRight = "32px";
		this.divOnTop.style.paddingBottom = "8px";
		this.options.appendChild(this.divOnTop);
		this.chkOnTop = document.createElement("input");
		this.chkOnTop.type = "checkbox";
		this.chkOnTop.checked = this.params.onTop;
		this.divOnTop.appendChild(this.chkOnTop);
		this.AddCheckBoxLabel(this.divOnTop, this.chkOnTop, "Always on top");

		this.chkAutoScroll.onchange = ()=> { this.params.autoScroll = this.chkAutoScroll.checked; };

		this.chkOpaque.onchange = ()=> {
			this.params.opaque = this.chkOpaque.checked;
			this.SetOpaque(this.chkOpaque.checked);
		};

		this.chkOnTop.onchange = ()=> {
			this.params.onTop = this.chkOnTop.checked;
			this.SetOnTop(this.chkOnTop.checked);
		};

		this.list.onscroll = event=> this.Log_onscroll(event);

		this.SetOpaque(this.chkOpaque.checked);
		this.SetOnTop(this.chkOnTop.checked);
		
		this.ListTodaysLog();
	}

	PopOut() { //override
		const btnUnPop = super.PopOut();

		this.divOpaque.style.visibility = "hidden";
		this.divOnTop.style.visibility = "hidden";

		if (this.popOutWindow && !this.params.opaque){
			this.SetOpaque(true);
		}

		btnUnPop.addEventListener("click", ()=> {
			this.divOpaque.style.visibility = "visible";
			this.divOnTop.style.visibility = "visible";
			if (!this.params.opaque) {
				this.SetOpaque(false);
			}
		});
	}

	Log_onscroll(event) {
		if (this.hasEnded) return;
		
		if (this.list.scrollTop < 2) {
			this.list.scrollTop = 2;
			this.ListNextLog();
		}
	}

	async ListTodaysLog() {
		this.isLoading = true;
		
		try {
			const response = await fetch("log/list");
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const text = await response.text();
			
			let split = text.split("\n");
			for (let i = 0; i < split.length - 1; i++) {
				if (split[i].length === 0) continue;
				this.Add(split[i]);
			}

			if (split.length > 1 && split[0].length >= 10) {
				let last =  split[0].substring(0, 4) + split[0].substring(5, 7) + split[0].substring(8, 10);
				if (!isNaN(last)) {
					this.last = last;
				}
			}
			if (!this.last) {
				const now = new Date();
				this.last = `${now.getFullYear()}${now.getMonth()+1}${now.getDate()}`;
			}

			this.list.scrollTop = 2;
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
		finally {
			this.isLoading = false;
			await this.ListNextLog();
			
			if (this.params.autoScroll) {
				this.list.scrollTop = this.list.scrollHeight;
			}
		}
	}

	async ListNextLog() {
		if (this.hasEnded || this.isLoading) return;

		this.isLoading = true;

		try {
			const response = await fetch(`log/list?last=${this.last}`);
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const text = await response.text();
			let split = text.split("\n");

			for (let i = split.length - 1; i >= 0; i--) {
				if (split[i].length === 0) continue;

				if (split[i] === "end") {
					this.hasEnded = true;
					const endElement = this.CreateLog("- END -");
					endElement.style.textAlign = "center";
					endElement.style.color = "#606060";
					endElement.style.paddingTop = endElement.style.paddingBottom = "16px";
					this.list.prepend(endElement);
					break;
				}

				const element = this.CreateLog(split[i]);
				this.list.prepend(element);
			}

			if (split.length > 1 && split[0].length >= 10) {
				let last =  split[0].substring(0, 4) + split[0].substring(5, 7) + split[0].substring(8, 10);
				if (!isNaN(last)) {
					this.last = last;
				}
			}
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
		finally {
			this.isLoading = false;
		}
	}

	CreateLog(log) {
		const element = document.createElement("div");
		element.textContent = log;
		element.style.fontFamily = "monospace";
		element.style.height = "24px";
		element.style.lineHeight = "24px";
		element.style.paddingLeft = "28px";
		element.style.whiteSpace = "pre-wrap";
		element.style.overflow = "hidden";
		return element;
	}

	Add(log) {
		const element = this.CreateLog(log);
		this.list.appendChild(element);
		if (this.params.autoScroll) element.scrollIntoView();
	}

	SetOpaque(opaque) {
		if (!opaque) {
			this.header.style.transition = ".4s";
			this.win.style.transition = ".4s";
			this.listTitle.style.transition = ".4s";
			this.list.style.transition = ".4s";
			this.titleIcon.style.transition = ".4s";
			this.options.style.transition = ".4s";

			this.header.style.color = "var(--clr-select)";
			this.win.style.backgroundColor = "rgba(64,64,64,.7)";
			this.win.style.boxShadow = "var(--clr-select) 0 0 1px 1px";
			this.win.style.backdropFilter = "none";
			this.resize.style.borderBottom = "16px solid var(--clr-select)";
			this.content.style.backgroundColor = "transparent";
			this.listTitle.style.color = "var(--clr-select)";
			this.listTitle.style.background = "transparent";
			this.listTitle.style.boxShadow = "var(--clr-select) 0 0 1px 1px";
			this.list.style.color = "var(--clr-select)";
			this.list.style.backgroundColor = "transparent";
			this.list.style.boxShadow = "var(--clr-select) 0 0 1px 1px";
			this.btnClose.style.backgroundColor = "var(--clr-select)";
			this.btnMaximize.style.backgroundColor = "var(--clr-select)";
			this.btnMinimize.style.backgroundColor = "var(--clr-select)";
			this.btnPopOut.style.backgroundColor = "var(--clr-select)";
			this.titleIcon.style.opacity = "0";
			this.options.style.color = "var(--clr-select)";

		}
		else {
			this.header.style.color = "";
			this.win.style.backgroundColor = "";
			this.win.style.boxShadow = "";
			this.win.style.backdropFilter = "";
			this.resize.style.borderBottom = "";
			this.content.style.backgroundColor = "";
			this.listTitle.style.color = "";
			this.listTitle.style.background = "";
			this.listTitle.style.boxShadow = "";
			this.list.style.boxShadow = "";
			this.list.style.color = "var(--clr-dark)";
			this.list.style.backgroundColor = "var(--clr-pane)";
			this.btnMaximize.style.backgroundColor = "";
			this.btnMinimize.style.backgroundColor = "";
			this.btnPopOut.style.backgroundColor = "";
			this.titleIcon.style.opacity = "";
			this.options.style.color = "";
		}
	}

	SetOnTop(onTop) {
		if (onTop) {
			this.BringToFront = ()=> {
				super.BringToFront();
				this.win.style.zIndex = "9999999";
			};

			this.win.style.zIndex = "9999999";
		}
		else {
			this.BringToFront = ()=> {
				super.BringToFront();
			};
			this.win.style.zIndex = ++WIN.count;
		}
	}
}