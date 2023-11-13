class Documentation extends Window {
	constructor(params) {
		super();

		this.params = params ?? { keywords: "" };

		this.AddCssDependencies("documentation.css");
		this.AddCssDependencies("list.css");

		this.SetTitle("Documentation");
		this.SetIcon("mono/documentation.svg");

		this.content.style.overflow = "auto";

		this.sidebar = document.createElement("div");
		this.sidebar.className = "doc-list-pane";
		this.content.appendChild(this.sidebar);

		const lblSearch = document.createElement("div");
		lblSearch.style.gridArea = "1 / 1";
		lblSearch.textContent = "Search:";
		this.sidebar.appendChild(lblSearch);

		this.txtSearch = document.createElement("input");
		this.txtSearch.style.gridArea = "1 / 2";
		this.txtSearch.type = "search";
		this.txtSearch.value = this.params.keywords;
		this.sidebar.appendChild(this.txtSearch);

		this.list = document.createElement("div");
		this.list.className = "no-results";
		this.list.style.backgroundColor = "var(--clr-pane)";
		this.list.style.gridArea = "3 / 1 / 4 / 3";
		this.list.style.width = "100%";
		this.list.style.height = "100%";
		this.list.style.borderRadius = "4px";
		this.list.style.overflowY = "auto";
		this.sidebar.appendChild(this.list);

		this.options = document.createElement("div");
		this.options.className = "doc-options";
		this.content.append(this.options);

		this.btnNew = document.createElement("input");
		this.btnNew.type = "button";
		this.btnNew.value = "New";
		this.btnNew.className = "with-icon";
		this.btnNew.style.backgroundImage = "url(mono/add.svg?light)";
		this.options.appendChild(this.btnNew);

		this.btnEdit = document.createElement("input");
		this.btnEdit.type = "button";
		this.btnEdit.value = "Edit";
		this.btnEdit.className = "with-icon";
		this.btnEdit.style.backgroundImage = "url(mono/edit.svg?light)";
		this.options.appendChild(this.btnEdit);

		this.btnDelete = document.createElement("input");
		this.btnDelete.type = "button";
		this.btnDelete.value = "Delete";
		this.btnDelete.className = "with-icon";
		this.btnDelete.style.backgroundImage = "url(mono/delete.svg?light)";
		this.options.appendChild(this.btnDelete);

		this.btnSave = document.createElement("input");
		this.btnSave.type = "button";
		this.btnSave.value = "Save";
		this.btnSave.className = "with-icon";
		this.btnSave.style.backgroundImage = "url(mono/floppy.svg?light)";
		this.options.appendChild(this.btnSave);

		this.btnDiscard = document.createElement("input");
		this.btnDiscard.type = "button";
		this.btnDiscard.value = "Discard";
		this.btnDiscard.className = "with-icon";
		this.btnDiscard.style.backgroundImage = "url(mono/disable.svg?light)";
		this.options.appendChild(this.btnDiscard);

		this.body = document.createElement("div");
		this.body.className = "doc-body-outer";

		this.content.append(this.body);

		this.lblTitle = document.createElement("div");
		this.lblTitle.textContent = "Title:";
		this.lblTitle.className = "lblTitle";
		this.body.appendChild(this.lblTitle);
		this.txtTitle = document.createElement("input");
		this.txtTitle.type = "text";
		this.txtTitle.className = "txtTitle";
		this.body.appendChild(this.txtTitle);

		this.body.appendChild(document.createElement("br"));

		this.lblRelated = document.createElement("div");
		this.lblRelated.textContent = "Related devices:";
		this.lblRelated.className = "lblRelated";
		this.body.appendChild(this.lblRelated);
		this.divRelated = document.createElement("div");
		this.divRelated.className = "divRelated";
		this.body.appendChild(this.divRelated);

		this.body.appendChild(document.createElement("br"));

		this.btnAddRelated = document.createElement("input");
		this.btnAddRelated.type = "button";
		this.btnAddRelated.style.right = "4px";
		this.btnAddRelated.style.top = "50px";
		this.btnAddRelated.style.minWidth = "28px";
		this.btnAddRelated.style.width = "28px";
		this.btnAddRelated.style.height = "28px";
		this.btnAddRelated.style.borderRadius = "0 8px 8px 0";
		this.btnAddRelated.style.backgroundColor = "var(--clr-control)";
		this.btnAddRelated.style.backgroundImage = "url(mono/newdevice.svg)";
		this.btnAddRelated.style.backgroundRepeat = "no-repeat";
		this.btnAddRelated.style.backgroundSize = "24px 24px";
		this.btnAddRelated.style.backgroundPosition = "center center";

		this.body.appendChild(this.btnAddRelated);

		this.divContentContainer = document.createElement("div");
		this.divContentContainer.className = "doc-content";
		this.body.appendChild(this.divContentContainer);

		this.divContent = document.createElement("div");
		this.divContent.style.width = "100%";
		this.divContent.style.minHeight = "100%";
		this.divContentContainer.appendChild(this.divContent);

		this.btnBold = document.createElement("button");
		this.btnBold.style.backgroundImage = "url(mono/bold.svg?light)";
		this.btnBold.style.left = "0px";
		this.btnBold.classList.add("doc-edit-button");
		this.body.appendChild(this.btnBold);

		this.btnItalic = document.createElement("button");
		this.btnItalic.style.backgroundImage = "url(mono/italic.svg?light)";
		this.btnItalic.style.left = "36px";
		this.btnItalic.classList.add("doc-edit-button");
		this.body.appendChild(this.btnItalic);

		this.btnUnderline = document.createElement("button");
		this.btnUnderline.style.backgroundImage = "url(mono/underline.svg?light)";
		this.btnUnderline.style.left = "72px";
		this.btnUnderline.classList.add("doc-edit-button");
		this.body.appendChild(this.btnUnderline);

		this.btnOList = document.createElement("button");
		this.btnOList.style.backgroundImage = "url(mono/orderedlist.svg?light)";
		this.btnOList.style.left = "108px";
		this.btnOList.classList.add("doc-edit-button");
		this.body.appendChild(this.btnOList);

		this.btnUList = document.createElement("button");
		this.btnUList.style.backgroundImage = "url(mono/unorderedlist.svg?light)";
		this.btnUList.style.left = "144px";
		this.btnUList.classList.add("doc-edit-button");
		this.body.appendChild(this.btnUList);

		this.btnCode = document.createElement("button");
		this.btnCode.style.backgroundImage = "url(mono/code.svg?light)";
		this.btnCode.style.left = "180px";
		this.btnCode.classList.add("doc-edit-button");
		this.body.appendChild(this.btnCode);

		this.btnLink = document.createElement("button");
		this.btnLink.style.backgroundImage = "url(mono/link.svg?light)";
		this.btnLink.style.left = "216px";
		this.btnLink.classList.add("doc-edit-button");
		this.body.appendChild(this.btnLink);

		this.txtSearch.onchange = ()=> this.ListDocs();

		this.btnNew.onclick = ()=> this.New();
		this.btnEdit.onclick = ()=> this.Edit();
		this.btnDelete.onclick = ()=> this.Delete();
		this.btnSave.onclick = ()=> this.Save();
		this.btnDiscard.onclick = ()=> this.Discard();

		this.btnAddRelated.onclick = ()=> this.AddRelatedDialog();

		this.btnBold.onclick = ()=> { document.execCommand("bold", false, null); };
		this.btnItalic.onclick = ()=> { document.execCommand("italic", false, null); };
		this.btnUnderline.onclick = ()=> { document.execCommand("underline", false, null); };
		this.btnOList.onclick = ()=> { document.execCommand("insertOrderedList", false, null); };
		this.btnUList.onclick = ()=> { document.execCommand("insertUnorderedList", false, null); };

		this.btnCode.onclick = ()=> {
			let sel, range;
			if (window.getSelection && (sel = window.getSelection()).rangeCount) {
				range = sel.getRangeAt(0);
				if (range.startContainer.className != "") return;

				var div = document.createElement("div");
				div.className = "doc-code";
				range.insertNode(div);
				range.setStart(div, 0);

				sel.removeAllRanges();
				sel.addRange(range);
			}
		};

		this.btnLink.onclick = ()=> {
			let sel = window.getSelection();
			let range = sel.getRangeAt(0);

			const dialog = this.DialogBox("125px");
			if (dialog === null) return;

			const btnOK = dialog.btnOK;
			const btnCancel = dialog.btnCancel;
			const innerBox = dialog.innerBox;

			innerBox.style.textAlign = "center";

			innerBox.appendChild(document.createElement("br"));

			const lblLink = document.createElement("div");
			lblLink.textContent = "Link:";
			lblLink.style.display = "inline-block";
			innerBox.appendChild(lblLink);

			const txtLink = document.createElement("input");
			txtLink.type = "text";
			txtLink.placeholder = "https://github.com/veniware";
			txtLink.style.width = "calc(80% - 64px)";
			innerBox.appendChild(txtLink);

			const Ok_onclick = btnOK.onclick;
			btnOK.onclick = ()=> {
				if (txtLink.value.length > 0) {
					sel.removeAllRanges();
					sel.addRange(range);
					document.execCommand("createLink", false, txtLink.value);
					document.getSelection().anchorNode.parentElement.target = '_blank';
					Ok_onclick();
				}
			};

			txtLink.onkeydown = event=> {
				if (event.key === "Enter") {
					btnOK.focus();
					return;
				}
			};

			setTimeout(()=> txtLink.focus(), 10);
		};
		
		this.ReadMode();
		this.ListDocs();
		
		this.OnUiReady();

		setTimeout(()=> { this.AfterResize(); }, 250);
	}

	OnUiReady(count = 0) {
		if (this.content.clientWidth === 0 && count < 200)
			setTimeout(()=> this.OnUiReady(++count), 50);
		else
			this.UpdateAuthorization();
	}

	AfterResize() { //override
		super.AfterResize();
		if (this.options.getBoundingClientRect().width < 260)
			this.options.classList.add("doc-options-collapsed");
		else
			this.options.classList.remove("doc-options-collapsed");
	}

	UpdateAuthorization() { //override
		if (!KEEP.authorization.includes("*") && !KEEP.authorization.includes("documentation:write")) {
			this.btnNew.disabled = true;
			this.btnEdit.disabled = true;
			this.btnDelete.disabled = true;
			this.btnSave.disabled = true;
			this.btnDiscard.disabled = true;
			return;
		}

		this.btnEdit.disabled = false;
		this.btnDelete.disabled = false;

		if (this.txtTitle.value.length === 0) {
			this.btnEdit.disabled = true;
			this.btnDelete.disabled = true;
		}
	}

	async ListDocs() {
		this.params = { keywords: this.txtSearch.value };
		try {
			let uri = this.txtSearch.value.length === 0 ?
				"docs/list" :
				`docs/list?keywords=${encodeURIComponent(this.txtSearch.value)}`;

			const response = await fetch(uri);

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
			
			const json = await response.json();
			if (json.error) throw(json.error);

			if (json.length > 0) {
				this.UpdateList(json);
			}
			else {
				this.txtTitle.value = "";
				this.divRelated.textContent = "";
				this.list.textContent = "";
			}
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	UpdateList(array) {
		this.txtTitle.value = "";
		this.divRelated.textContent = "";
		this.list.textContent = "";

		for (let i = 0; i < array.length; i++) {
			if (array[i].length == 0) continue;
			const entry = this.AddToList(array[i]);

			if (this.selected && this.selected === array[i])
				entry.onclick();
		}

		this.UpdateAuthorization();
	}

	AddToList(name) {
		const entry = document.createElement("div");
		entry.className = "doc-entry";
		entry.textContent = name;
		this.list.appendChild(entry);

		entry.onclick = ()=> {
			if (this.lastselected)
				this.lastselected.style.backgroundColor = "";

			entry.style.backgroundColor = "var(--clr-select)";
			this.lastselected = entry;
			this.selected = name;

			this.Preview(name);
		};

		return entry;
	}

	async Preview(name) {
		if (!name) {
			this.txtTitle.value = "";
			this.divRelated.textContent = "";
			this.divContent.textContent = "";
			this.UpdateAuthorization();
			this.selected = null;
			return;
		}

		this.txtTitle.value = name;
		this.UpdateAuthorization();

		try {
			const response = await fetch(`docs/view?name=${encodeURIComponent(name)}`);

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
			
			const text = await response.text();
			this.divRelated.textContent = "";
			this.divContent.innerHTML = text;

			let commentStop = text.indexOf("-->", 0);
			if (text.startsWith("<!--") && commentStop > -1) {
				let comment = text.substring(4, commentStop);
				let related = JSON.parse(comment);

				for (let i = 0; i < related.length - 3; i+=4)
					this.AddRelated(related[i], related[i+1], related[i+2], related[i+3]);
			}
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	ReadMode() {
		this.sidebar.style.transform = "none";
		this.sidebar.style.filter = "none";
		this.sidebar.style.visibility = "visible";

		this.options.style.left = "";
		this.body.style.left = "";

		this.btnNew.style.display = "inline-block";
		this.btnEdit.style.display = "inline-block";
		this.btnDelete.style.display = "inline-block";
		this.btnSave.style.display = "none";
		this.btnDiscard.style.display = "none";

		this.txtTitle.readOnly = true;

		this.divRelated.classList.remove("doc-related-editable");
		this.divRelated.style.right = "8px";
		this.btnAddRelated.style.opacity = "0";
		this.btnAddRelated.style.visibility = "hidden";
		this.divContent.contentEditable = false;

		this.btnBold.style.opacity = "0";
		this.btnBold.style.visibility = "hidden";
		this.btnItalic.style.opacity = "0";
		this.btnItalic.style.visibility = "hidden";
		this.btnUnderline.style.opacity = "0";
		this.btnUnderline.style.visibility = "hidden";
		this.btnOList.style.opacity = "0";
		this.btnOList.style.visibility = "hidden";
		this.btnUList.style.opacity = "0";
		this.btnUList.style.visibility = "hidden";
		this.btnCode.style.opacity = "0";
		this.btnCode.style.visibility = "hidden";
		this.btnLink.style.opacity = "0";
		this.btnLink.style.visibility = "hidden";

		this.divContentContainer.style.top = "104px";

		setTimeout(()=> this.AfterResize(), 400);
	}

	EditMode() {
		this.sidebar.style.transform = "translateX(-300px)";
		this.sidebar.style.filter = "opacity(0)";
		this.sidebar.style.visibility = "hidden";

		this.options.style.left = "4px";
		this.body.style.left = "4px";

		this.btnNew.style.display = "none";
		this.btnEdit.style.display = "none";
		this.btnDelete.style.display = "none";
		this.btnSave.style.display = "inline-block";
		this.btnDiscard.style.display = "inline-block";

		this.txtTitle.readOnly = false;

		this.divRelated.classList.add("doc-related-editable");
		this.divRelated.style.right = "36px";
		this.btnAddRelated.style.opacity = "1";
		this.btnAddRelated.style.visibility = "visible";
		this.divContent.contentEditable = true;

		this.btnBold.style.opacity = "1";
		this.btnBold.style.visibility = "visible";
		this.btnItalic.style.opacity = "1";
		this.btnItalic.style.visibility = "visible";
		this.btnUnderline.style.opacity = "1";
		this.btnUnderline.style.visibility = "visible";
		this.btnOList.style.opacity = "1";
		this.btnOList.style.visibility = "visible";
		this.btnUList.style.opacity = "1";
		this.btnUList.style.visibility = "visible";
		this.btnCode.style.opacity = "1";
		this.btnCode.style.visibility = "visible";
		this.btnLink.style.opacity = "1";
		this.btnLink.style.visibility = "visible";

		this.divContentContainer.style.top = "144px";

		setTimeout(()=> this.AfterResize(), 400);
	}

	New() {
		this.EditMode();

		this.divContent.textContent = "";

		const table = document.createElement("table");
		this.divContent.appendChild(table);

		const tr1 = document.createElement("tr");
		table.appendChild(tr1);
		const td1_1 = document.createElement("td");
		td1_1.textContent = "Author";
		tr1.appendChild(td1_1);
		const td1_2 = document.createElement("td");
		tr1.appendChild(td1_2);

		const tr2 = document.createElement("tr");
		table.appendChild(tr2);
		const td2_1 = document.createElement("td");
		td2_1.textContent = "Location";
		tr2.appendChild(td2_1);
		const td2_2 = document.createElement("td");
		tr2.appendChild(td2_2);

		const tr3 = document.createElement("tr");
		table.appendChild(tr3);
		const td3_1 = document.createElement("td");
		td3_1.textContent = "Time spent";
		tr3.appendChild(td3_1);
		const td3_2 = document.createElement("td");
		tr3.appendChild(td3_2);

		this.divContent.appendChild(document.createElement("br"));

		const desc = document.createElement("div");
		desc.textContent = "Description:";
		//desc.style.fontSize = "large";
		desc.style.fontWeight = 600;
		desc.style.textDecoration = "underline";
		this.divContent.appendChild(desc);

		this.divContent.appendChild(document.createElement("br"));
		this.divContent.appendChild(document.createElement("br"));
		this.divContent.appendChild(document.createElement("br"));


		this.txtTitle.value = "";
		this.divRelated.textContent = "";
		this.txtTitle.focus();
	}

	Edit() {
		this.EditMode();
	}

	async Delete() {
		if (!this.selected) return;

		try {
			const response = await fetch(`docs/delete?name=${this.selected}`);

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
			
			const json = await response.json();
			if (json.error) throw(json.error);

			this.selected = null;
			this.Preview(null);
			this.ListDocs();
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	async Save() {
		if (this.txtTitle.value.length == 0) {
			this.ConfirmBox("Please enter a title", true).addEventListener("click", ()=> this.txtTitle.focus());
			return;
		}

		let nameLower = this.txtTitle.value.toLowerCase();
		let exist = false;
		for (let i=0; i<this.list.childNodes.length; i++) {
			if (this.list.childNodes[i].textContent.toLowerCase() === nameLower) {
				exist = true;
				break;
			}
		}

		let payload = "";
		payload += this.txtTitle.value + String.fromCharCode(127);
		payload += this.divContent.innerHTML + String.fromCharCode(127);

		for (let i = 0; i < this.divRelated.childNodes.length; i++) {
			payload += this.divRelated.childNodes[i].getAttribute("file") + String.fromCharCode(127);
			payload += this.divRelated.childNodes[i].style.backgroundImage + String.fromCharCode(127);
			payload += this.divRelated.childNodes[i].getAttribute("label1") + String.fromCharCode(127);
			payload += this.divRelated.childNodes[i].getAttribute("label2") + String.fromCharCode(127);
		}

		try {
			const response = await fetch("docs/create", {
				method: "POST",
				body: payload,
			});

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
			
			const json = await response.json();
			if (json.error) throw(json.error);

			if (exist) {
				this.ReadMode();
			}
			else {
				const entry = this.AddToList(this.txtTitle.value);
				this.ReadMode();
				setTimeout(()=> entry.onclick(), 0);
			}

		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	Discard() {
		this.ReadMode();
		this.Preview(this.selected);
	}

	AddRelatedDialog() {
		const dialog = this.DialogBox("85%");
		if (dialog === null) return;

		const btnOK = dialog.btnOK;
		const btnCancel = dialog.btnCancel;
		const innerBox = dialog.innerBox;

		innerBox.style.padding = "8px";

		btnOK.style.display = "none";

		const txtFind = document.createElement("input");
		txtFind.type = "text";
		txtFind.placeholder = "Search";
		innerBox.appendChild(txtFind);

		const divDevices = document.createElement("div");
		divDevices.className = "no-results";
		divDevices.style.position = "absolute";
		divDevices.style.left = divDevices.style.right = "0";
		divDevices.style.top = "48px";
		divDevices.style.bottom = "0";
		divDevices.style.overflowY = "auto";
		innerBox.appendChild(divDevices);

		txtFind.onchange = txtFind.oninput = ()=> {
			divDevices.textContent = "";

			let keywords = [];
			if (txtFind.value.trim().length > 0)
				keywords = txtFind.value.trim().toLowerCase().split(" ");

			let devicesColumns;
			if (localStorage.getItem("deviceslist_columns")) {
				devicesColumns = JSON.parse(localStorage.getItem("deviceslist_columns"));
			}
			else {
				devicesColumns = ["name","type","ip","hostname","mac address","serial number"];
			}

			for (let key in LOADER.devices.data) {
				let match = true;

				for (let i = 0; i < keywords.length; i++) {
					let flag = false;
					for (let attr in LOADER.devices.data[key]) {
						if (LOADER.devices.data[key][attr].v.toLowerCase().indexOf(keywords[i]) > -1)
							flag = true;
					}
					if (!flag) {
						match = false;
						continue;
					}
				}

				if (!match) continue;

				let name = "";
				if (LOADER.devices.data[key].hasOwnProperty("name")) {
					name = LOADER.devices.data[key]["name"].v;
				}
				else if (LOADER.devices.data[key].hasOwnProperty("hostname")) {
					name = LOADER.devices.data[key]["hostname"].v;
				}
				else if (LOADER.devices.data[key].hasOwnProperty("ip")) {
					name = LOADER.devices.data[key]["ip"].v;
				}

				let unique = "";
				if (LOADER.devices.data[key].hasOwnProperty("serial number")) {
					unique = LOADER.devices.data[key]["serial number"].v;
				}
				else if (LOADER.devices.data[key].hasOwnProperty("mac address")) {
					unique = LOADER.devices.data[key]["mac address"].v;
				}

				if (name.length === 0 && unique.length === 0) continue;

				let type = LOADER.devices.data[key]["type"];
				let iconUrl = `url(${LOADER.deviceIcons[type] ?? "mono/gear.svg"})`;

				const element = document.createElement("div");
				element.className = "list-element";
				divDevices.appendChild(element);

				const icon = document.createElement("div");
				icon.className = "list-element-icon";
				icon.style.backgroundImage = iconUrl;
				element.appendChild(icon);

				for (let i=0; i<devicesColumns.length; i++) {
					if (!LOADER.devices.data[key].hasOwnProperty(devicesColumns[i])) continue;
					if (LOADER.devices.data[key][devicesColumns[i]].v.length === 0) continue;
					
					const newLabel = document.createElement("div");
					newLabel.textContent = LOADER.devices.data[key][devicesColumns[i]].v;
					newLabel.style.left = `calc(28px + ${i * 100 / devicesColumns.length}%)`;
					newLabel.style.width = `${100 / devicesColumns.length}%`;
					element.appendChild(newLabel);
				}

				element.ondblclick = ()=> {
					this.AddRelated(key, iconUrl, name, unique);
					btnCancel.onclick();
				};

				divDevices.appendChild(element);
			}
		};

		txtFind.focus();
		txtFind.onchange();
	}

	AddRelated(filename, icon, label1, label2) {
		const related = document.createElement("div");
		related.setAttribute("file", filename);
		related.setAttribute("label1", label1);
		related.setAttribute("label2", label2);
		related.style.backgroundImage = icon;
		this.divRelated.appendChild(related);

		const divRemove = document.createElement("div");
		related.appendChild(divRemove);

		related.onclick = event=> {
			for (let j = 0; j < $w.array.length; j++)
				if ($w.array[j] instanceof Equip && $w.array[j].filename === filename) {
					$w.array[j].Minimize(); //minimize/restore
					return;
				}

			new Equip(filename);
			event.stopPropagation();
		};

		divRemove.onclick = event=> {
			event.stopPropagation();
			this.divRelated.removeChild(related);
		};
	}
}