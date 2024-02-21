class Wmi extends Window {
	constructor(params) {
		super();

		this.AddCssDependencies("wmi.css");

		this.params = params ?? { target: "", query: "" };

		this.SetTitle("WMI client");
		this.SetIcon("mono/wmi.svg");

		this.wmi_classes = {};
		this.GetWmiClasses();

		this.content.style.overflow = "hidden";

		const divInput = document.createElement("div");
		divInput.className = "wmi-input";
		this.content.appendChild(divInput);

		const lblTarget = document.createElement("div");
		lblTarget.style.gridArea = "1 / 1";
		lblTarget.textContent = "Target: ";
		divInput.appendChild(lblTarget);

		this.txtTarget = document.createElement("input");
		this.txtTarget.type = "text";
		this.txtTarget.placeholder = "hostname or ip";
		this.txtTarget.style.gridArea = "1 / 2";
		if (this.params.target != null) this.txtTarget.value = this.params.target;
		divInput.appendChild(this.txtTarget);

		const btnTarget = document.createElement("input");
		btnTarget.type = "button";
		btnTarget.value = "...";
		btnTarget.style.gridArea = "2 / 3";
		divInput.appendChild(btnTarget);

		const lblQuery = document.createElement("div");
		lblQuery.textContent = "Query: ";
		lblQuery.style.gridArea = "2 / 1";
		divInput.appendChild(lblQuery);

		this.txtQuery = document.createElement("textarea");
		this.txtQuery.placeholder = "e.g.: SELECT * FROM Win32_BIOS WHERE Status = \"OK\"";
		this.txtQuery.style.gridArea = "2 / 2 / 2 span / auto";
		//this.txtQuery.style.fontFamily = "monospace";
		this.txtQuery.style.resize = "none";
		if (this.params.query != null) this.txtQuery.value = this.params.query;
		divInput.appendChild(this.txtQuery);

		this.btnExecute = document.createElement("input");
		this.btnExecute.type = "button";
		this.btnExecute.value = "Execute";
		this.btnExecute.style.height = "auto";
		this.btnExecute.style.gridArea = "3 / 3";
		divInput.appendChild(this.btnExecute);

		const btnToggle = document.createElement("input");
		btnToggle.type = "button";
		btnToggle.className = "wmi-toggle-button";
		this.content.appendChild(btnToggle);

		this.divPlot = document.createElement("div");
		this.divPlot.className = "wmi-plot no-results";
		this.content.appendChild(this.divPlot);

		this.txtTarget.oninput = ()=> { this.params.target = this.txtTarget.value };
		this.txtQuery.oninput = ()=> { this.params.query = this.txtQuery.value };

		btnTarget.onclick = ()=> this.SequelAssistant();

		this.btnExecute.onclick = ()=> this.Query();

		btnToggle.onclick =()=> {
			if (divInput.style.visibility === "hidden") {
				btnToggle.style.top = "96px";
				btnToggle.style.transform = "rotate(-180deg)";
				divInput.style.visibility = "visible";
				divInput.style.opacity = "1";
				divInput.style.transform = "none";
				this.divPlot.style.top = "136px";
			}
			else {
				btnToggle.style.top = "0px";
				btnToggle.style.transform = "rotate(0deg)";
				divInput.style.visibility = "hidden";
				divInput.style.opacity = "0";
				divInput.style.transform = "translateY(-64px)";
				this.divPlot.style.top = "36px";
			}
		};

		if (this.params.target.length > 0 && this.params.query.length > 0) {
			this.btnExecute.onclick();
			btnToggle.onclick();
		}
	}

	async GetWmiClasses() {
		try {
			const response = await fetch("wmiclasses.json");

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);

			this.wmi_classes = json;
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	SequelAssistant() {
		let lastQuery = this.txtQuery.value.toLowerCase();

		let words = lastQuery.split(" ");
		let className = null;
		if (this.wmi_classes.classes) {
			for (let i = 0; i < words.length; i++) {
				if (words[i].toUpperCase() === "FROM" && i !== words.length-1) {
					className = words[i+1].toLowerCase();
					break;
				}
			}
		}

		let select_index = lastQuery.indexOf("select");
		let from_index = lastQuery.indexOf("from");
		let lastProperties = lastQuery.substring(select_index + 6, from_index).trim();
		let lastPropertiesArray = lastProperties.split(",").map(o=>o.trim());

		const dialog = this.DialogBox("640px");
		if (dialog === null) return;

		const btnOK = dialog.btnOK;
		const innerBox = dialog.innerBox;

		innerBox.style.margin = "16px";
		innerBox.style.display = "grid";
		innerBox.style.gridTemplateColumns = "50% 16px auto";
		innerBox.style.gridTemplateRows = "32px 8px auto 8px 64px";

		const txtClassFilter = document.createElement("input");
		txtClassFilter.type = "text";
		txtClassFilter.placeholder = "Find..";
		txtClassFilter.style.gridArea = "1 / 1";

		const btnNone = document.createElement("input");
		btnNone.type = "button";
		btnNone.style.position = "absolute";
		btnNone.style.right = "32px";
		btnNone.style.width = "28px";
		btnNone.style.minWidth = "28px";
		btnNone.style.backgroundColor = "transparent";
		btnNone.style.backgroundImage = "url(/mono/selectnone.svg)";
		btnNone.style.backgroundSize = "24px 24px";
		btnNone.style.backgroundPosition = "center";
		btnNone.style.backgroundRepeat = "no-repeat";

		const btnAll = document.createElement("input");
		btnAll.type = "button";
		btnAll.style.position = "absolute";
		btnAll.style.right = "0";
		btnAll.style.width = "28px";
		btnAll.style.minWidth = "28px";
		btnAll.style.backgroundColor = "transparent";
		btnAll.style.backgroundImage = "url(/mono/selectall.svg)";
		btnAll.style.backgroundSize = "24px 24px";
		btnAll.style.backgroundPosition = "center";
		btnAll.style.backgroundRepeat = "no-repeat";

		innerBox.append(txtClassFilter, btnNone, btnAll);

		const lstClasses = document.createElement("div");
		lstClasses.className = "wmi-classes-list";
		lstClasses.style.border = "var(--clr-control) solid 1.5px";
		lstClasses.style.gridArea = "3 / 1";
		lstClasses.style.overflowY = "scroll";

		const lstProperties = document.createElement("div");
		lstProperties.className = "wmi-properties-list";
		lstProperties.style.border = "var(--clr-control) solid 1.5px";
		lstProperties.style.gridArea = "3 / 3";
		lstProperties.style.overflowY = "scroll";

		const txtPreview = document.createElement("textarea");
		txtPreview.setAttribute("readonly", true);
		txtPreview.style.resize = "none";
		txtPreview.style.gridArea = "5 / 1 / span 1 / span 3";

		innerBox.append(lstClasses, lstProperties, txtPreview);

		if (!this.wmi_classes.classes) {
			this.ConfirmBox("Failed to load WMI classes.");
			btnOK.onclick();
			return;
		}

		btnOK.addEventListener("click", ()=> {
			this.txtQuery.value = txtPreview.value;
			this.params.query = this.txtQuery.value;
		});

		txtClassFilter.onkeydown = event=>{
			if (event.code === "Escape") {
				txtClassFilter.value = "";
				txtClassFilter.oninput()
			}
		};

		let selected = null;
		let propertiesList = [];
		let propertyCheckboxes = [];

		txtClassFilter.oninput = ()=> {
			if (!this.wmi_classes.classes) return;
			let filter = txtClassFilter.value.toLowerCase();

			lstClasses.textContent = "";
			lstProperties.textContent = "";

			for (let i = 0; i < this.wmi_classes.classes.length; i++) {
				let matched = false;

				if (this.wmi_classes.classes[i].class.toLowerCase().indexOf(filter) > -1) {
					matched = true;
				}
				else {
					for (let j = 0; j < this.wmi_classes.classes[i].properties.length; j++) {
						if (this.wmi_classes.classes[i].properties[j].toLowerCase().indexOf(filter) > -1) {
							matched = true;
							break;
						}
					}
				}

				if (matched) {
					const newClass = document.createElement("div");
					newClass.textContent = this.wmi_classes.classes[i].class;
					lstClasses.appendChild(newClass);

					newClass.onclick = ()=> {
						if (selected != null) selected.style.backgroundColor = "";

						propertiesList = [];
						propertyCheckboxes = [];

						lstProperties.textContent = "";
						for (let j = 0; j < this.wmi_classes.classes[i].properties.length; j++) {
							let value = lastProperties === "*" || className == null ||
								className.toLowerCase() === this.wmi_classes.classes[i].class.toLowerCase() &&
								lastPropertiesArray.includes(this.wmi_classes.classes[i].properties[j].toLowerCase());

							const divProperty = document.createElement("div");
							const chkProperty = document.createElement("input");
							chkProperty.type = "checkbox";
							chkProperty.checked = value;
							propertyCheckboxes.push(chkProperty);
							divProperty.appendChild(chkProperty);

							propertiesList.push(value);

							chkProperty.onchange = ()=> {
								propertiesList[j] = chkProperty.checked;

								let count = 0;
								for (let k = 0; k < propertiesList.length; k++) {
									if (propertiesList[k])
										count++;
								}

								if (count === 0 || count === propertiesList.length) {
									txtPreview.value = "SELECT * FROM " + this.wmi_classes.classes[i].class;
								}
								else {
									let sel = "";
									for (let k = 0; k < propertiesList.length; k++)
										if (propertiesList[k])
											sel += (sel.length == 0) ? this.wmi_classes.classes[i].properties[k] : ", " + this.wmi_classes.classes[i].properties[k];

									txtPreview.value = "SELECT " + sel + " FROM " + this.wmi_classes.classes[i].class;
								}
							};

							this.AddCheckBoxLabel(divProperty, chkProperty, this.wmi_classes.classes[i].properties[j]);
							lstProperties.appendChild(divProperty);

							if (filter && this.wmi_classes.classes[i].properties[j].toLowerCase().indexOf(filter) > -1) {
								divProperty.scrollIntoView({ behavior: "smooth"});
								setTimeout(()=>{divProperty.style.animation = "highlight .8s 1"}, 500);
							}

							selected = newClass;
							selected.style.backgroundColor = "var(--clr-select)";
						}

						txtPreview.value = "SELECT * FROM " + this.wmi_classes.classes[i].class;
					};

					newClass.ondblclick = ()=> {
						this.txtQuery.value = txtPreview.value;
						btnOK.onclick();
					};

					if (className && className === this.wmi_classes.classes[i].class.toLowerCase()) {
						newClass.onclick();
						newClass.scrollIntoView();
						className = null;
					}
				}
			}
		};
		txtClassFilter.oninput();

		btnAll.onclick = ()=> {
			if (propertyCheckboxes.length === 0) return;

			for (let i = 0; i < propertyCheckboxes.length; i++) {
				propertyCheckboxes[i].checked = true;
				propertiesList[i] = true;
			}

			propertyCheckboxes[0].onchange();
		};

		btnNone.onclick = ()=> {
			if (propertyCheckboxes.length === 0) return;

			for (let i = 0; i < propertyCheckboxes.length; i++) {
				propertyCheckboxes[i].checked = false;
				propertiesList[i] = false;
			}

			propertyCheckboxes[0].onchange();
		};
	}

	CallMethodDialog() {
		const dialog = this.DialogBox("640px");
		if (dialog === null) return;

		const btnOK = dialog.btnOK;

		btnOK.addEventListener("click", ()=> {

		});
	}

	async Query() {
		if (this.txtTarget.value.length == 0 || this.txtQuery.value.length == 0) {
			this.ConfirmBox("Incomplete query.", true);
			return;
		}

		this.SetIcon("mono/wmi.svg");
		this.SetTitle("WMI client");

		const spinner = document.createElement("div");
		spinner.className = "spinner";
		spinner.style.textAlign = "left";
		spinner.style.marginTop = "160px";
		spinner.style.marginBottom = "32px";
		spinner.appendChild(document.createElement("div"));
		this.content.appendChild(spinner);

		this.txtTarget.value = this.txtTarget.value.trim();
		this.btnExecute.disabled = true;
		this.divPlot.style.display = "none";
		this.divPlot.textContent = "";

		try {
			const response = await fetch(`wmi/query?target=${encodeURIComponent(this.txtTarget.value)}`, {
				method: "POST",
				body: this.txtQuery.value.trim().replaceAll("\n", " ")
			});

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const text = await response.text();
			let split = text.split(String.fromCharCode(127));
			if (split.length > 1) this.Plot(split);
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
		finally {
			this.btnExecute.disabled = false;
			this.divPlot.style.display = "block";
			this.content.removeChild(spinner);
		}
	}

	Plot(split) {
		let words = this.txtQuery.value.split(" ").map(v=> v.toLowerCase());
		let className = "";
		let hasMethods = false;
		let targetHost = this.txtTarget.value;

		if (this.wmi_classes.classes) {
			for (let i = 0; i < words.length; i++)
				if (words[i].startsWith("win32_")) {
					className = words[i];
					break;
				}

			for (let i = 0; i < this.wmi_classes.classes.length; i++)
				if (this.wmi_classes.classes[i].class.toLowerCase().indexOf(className) > -1) {
					hasMethods = this.wmi_classes.classes[i].methods;
					break;
				}
		}

		const table = document.createElement("table");
		table.className = "wmi-table";

		let length = parseInt(split[0]);
		let unique = -1; //unique id position
		for (let i = 1; i < length + 1; i++)
			if (className == "win32_process" && split[i] == "ProcessId") {
				unique = i - 1;
				break;
			}
			/*else if (className == "win32_service" && split[i] == "Name") {
				unique = i - 1;
				break;
			}*/

		for (let i = 1; i < split.length - 1; i += length) {
			const tr = document.createElement("tr");
			table.appendChild(tr);

			const tdn = document.createElement("td");
			tr.appendChild(tdn);

			for (let j = 0; j < length; j++) {
				let td = document.createElement("td");
				td.textContent = split[i + j];
				tr.appendChild(td);
			}

			if (hasMethods && unique > -1) {
				let td = document.createElement("td");
				tr.appendChild(td);

				if (i > length) {
					switch (className) {
					case "win32_process":
						const btnTerminate = document.createElement("input");
						btnTerminate.type = "button";
						btnTerminate.value = "Terminate";
						btnTerminate.setAttribute("pid", split[i + unique]);
						td.appendChild(btnTerminate);

						btnTerminate.onclick = async event=> {
							btnTerminate.disabled = true;
							let pid = event.target.getAttribute("pid");

							try {
								const response = await fetch(`wmi/killprocess?target=${encodeURIComponent(targetHost)}&pid=${pid}`);
								if (response.status !== 200) return;
								const text = await response.text();

								if (text === "ok")
									table.removeChild(tr);
								else {
									td.removeChild(btnTerminate);
									td.textContent = text;
								}
							}
							catch (ex) {
								this.ConfirmBox(ex, true, "mono/error.svg");
							}
						};
						break;

					/*default:
						let btnMethod = document.createElement("input");
						btnMethod.type  = "button";
						btnMethod.value = "Method";
						td.appendChild(btnMethod);
						btnMethod.onclick = ()=> {
							this.CallMethodDialog();
						};*/
					}
				}
			}
		}

		this.divPlot.appendChild(table);
	}
}