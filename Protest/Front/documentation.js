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

		const searchLabel = document.createElement("div");
		searchLabel.style.gridArea = "1 / 1";
		searchLabel.textContent = "Search:";
		this.sidebar.appendChild(searchLabel);

		this.searchInput = document.createElement("input");
		this.searchInput.style.gridArea = "1 / 2";
		this.searchInput.type = "search";
		this.searchInput.value = this.params.keywords;
		this.sidebar.appendChild(this.searchInput);

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

		this.newButton = document.createElement("input");
		this.newButton.type = "button";
		this.newButton.value = "New";
		this.newButton.className = "with-icon";
		this.newButton.style.backgroundImage = "url(mono/add.svg?light)";
		this.options.appendChild(this.newButton);

		this.editButton = document.createElement("input");
		this.editButton.type = "button";
		this.editButton.value = "Edit";
		this.editButton.className = "with-icon";
		this.editButton.style.backgroundImage = "url(mono/edit.svg?light)";
		this.options.appendChild(this.editButton);

		this.deleteButton = document.createElement("input");
		this.deleteButton.type = "button";
		this.deleteButton.value = "Delete";
		this.deleteButton.className = "with-icon";
		this.deleteButton.style.backgroundImage = "url(mono/delete.svg?light)";
		this.options.appendChild(this.deleteButton);

		this.saveButton = document.createElement("input");
		this.saveButton.type = "button";
		this.saveButton.value = "Save";
		this.saveButton.className = "with-icon";
		this.saveButton.style.backgroundImage = "url(mono/floppy.svg?light)";
		this.options.appendChild(this.saveButton);

		this.discardButton = document.createElement("input");
		this.discardButton.type = "button";
		this.discardButton.value = "Discard";
		this.discardButton.className = "with-icon";
		this.discardButton.style.backgroundImage = "url(mono/disable.svg?light)";
		this.options.appendChild(this.discardButton);

		this.body = document.createElement("div");
		this.body.className = "doc-body-outer";

		this.content.append(this.body);

		this.titleLabel = document.createElement("div");
		this.titleLabel.textContent = "Title:";
		this.titleLabel.className = "title-label";
		this.body.appendChild(this.titleLabel);
		this.titleInput = document.createElement("input");
		this.titleInput.type = "text";
		this.titleInput.className = "title-input";
		this.body.appendChild(this.titleInput);

		this.body.appendChild(document.createElement("br"));

		this.relatedLabel = document.createElement("div");
		this.relatedLabel.textContent = "Related devices:";
		this.relatedLabel.className = "related-label";

		this.body.appendChild(this.relatedLabel);
		this.relatedBox = document.createElement("div");
		this.relatedBox.className = "related-box";
		this.body.appendChild(this.relatedBox);

		this.body.appendChild(document.createElement("br"));

		this.addRelatedButton = document.createElement("input");
		this.addRelatedButton.type = "button";
		this.addRelatedButton.style.right = "4px";
		this.addRelatedButton.style.top = "50px";
		this.addRelatedButton.style.minWidth = "28px";
		this.addRelatedButton.style.width = "28px";
		this.addRelatedButton.style.height = "28px";
		this.addRelatedButton.style.borderRadius = "0 8px 8px 0";
		this.addRelatedButton.style.backgroundColor = "var(--clr-control)";
		this.addRelatedButton.style.backgroundImage = "url(mono/newdevice.svg)";
		this.addRelatedButton.style.backgroundRepeat = "no-repeat";
		this.addRelatedButton.style.backgroundSize = "24px 24px";
		this.addRelatedButton.style.backgroundPosition = "center center";

		this.body.appendChild(this.addRelatedButton);

		this.contentContainer = document.createElement("div");
		this.contentContainer.className = "doc-content";
		this.body.appendChild(this.contentContainer);

		this.contentBox = document.createElement("div");
		this.contentBox.style.width = "100%";
		this.contentBox.style.minHeight = "100%";
		this.contentContainer.appendChild(this.contentBox);

		this.boldButton = document.createElement("button");
		this.boldButton.style.backgroundImage = "url(mono/bold.svg?light)";
		this.boldButton.style.left = "0px";
		this.boldButton.classList.add("doc-edit-button");
		this.body.appendChild(this.boldButton);

		this.italicButton = document.createElement("button");
		this.italicButton.style.backgroundImage = "url(mono/italic.svg?light)";
		this.italicButton.style.left = "36px";
		this.italicButton.classList.add("doc-edit-button");
		this.body.appendChild(this.italicButton);

		this.underlineButton = document.createElement("button");
		this.underlineButton.style.backgroundImage = "url(mono/underline.svg?light)";
		this.underlineButton.style.left = "72px";
		this.underlineButton.classList.add("doc-edit-button");
		this.body.appendChild(this.underlineButton);

		this.oListButton = document.createElement("button");
		this.oListButton.style.backgroundImage = "url(mono/orderedlist.svg?light)";
		this.oListButton.style.left = "108px";
		this.oListButton.classList.add("doc-edit-button");
		this.body.appendChild(this.oListButton);

		this.uListButton = document.createElement("button");
		this.uListButton.style.backgroundImage = "url(mono/unorderedlist.svg?light)";
		this.uListButton.style.left = "144px";
		this.uListButton.classList.add("doc-edit-button");
		this.body.appendChild(this.uListButton);

		this.codeButton = document.createElement("button");
		this.codeButton.style.backgroundImage = "url(mono/code.svg?light)";
		this.codeButton.style.left = "180px";
		this.codeButton.classList.add("doc-edit-button");
		this.body.appendChild(this.codeButton);

		this.linkButton = document.createElement("button");
		this.linkButton.style.backgroundImage = "url(mono/link.svg?light)";
		this.linkButton.style.left = "216px";
		this.linkButton.classList.add("doc-edit-button");
		this.body.appendChild(this.linkButton);

		this.searchInput.onchange = ()=> this.ListDocs();

		this.newButton.onclick = ()=> this.New();
		this.editButton.onclick = ()=> this.Edit();
		this.deleteButton.onclick = ()=> this.Delete();
		this.saveButton.onclick = ()=> this.Save();
		this.discardButton.onclick = ()=> this.Discard();

		this.addRelatedButton.onclick = ()=> this.AddRelatedDialog();

		this.boldButton.onclick = ()=> { document.execCommand("bold", false, null); };
		this.italicButton.onclick = ()=> { document.execCommand("italic", false, null); };
		this.underlineButton.onclick = ()=> { document.execCommand("underline", false, null); };
		this.oListButton.onclick = ()=> { document.execCommand("insertOrderedList", false, null); };
		this.uListButton.onclick = ()=> { document.execCommand("insertUnorderedList", false, null); };

		this.codeButton.onclick = ()=> {
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

		this.linkButton.onclick = ()=> {
			let sel = window.getSelection();
			let range = sel.getRangeAt(0);

			const dialog = this.DialogBox("125px");
			if (dialog === null) return;

			const okButton = dialog.okButton;
			const cancelButton = dialog.cancelButton;
			const innerBox = dialog.innerBox;

			innerBox.style.textAlign = "center";

			innerBox.appendChild(document.createElement("br"));

			const linkLabel = document.createElement("div");
			linkLabel.textContent = "Link:";
			linkLabel.style.display = "inline-block";
			innerBox.appendChild(linkLabel);

			const linkInput = document.createElement("input");
			linkInput.type = "text";
			linkInput.placeholder = "https://github.com/openprotest";
			linkInput.style.width = "calc(80% - 64px)";
			innerBox.appendChild(linkInput);

			const Ok_onclick = okButton.onclick;
			okButton.onclick = ()=> {
				if (linkInput.value.length > 0) {
					sel.removeAllRanges();
					sel.addRange(range);
					document.execCommand("createLink", false, linkInput.value);
					document.getSelection().anchorNode.parentElement.target = '_blank';
					Ok_onclick();
				}
			};

			linkInput.onkeydown = event=> {
				if (event.key === "Enter") {
					okButton.focus();
					return;
				}
			};

			setTimeout(()=> linkInput.focus(), 10);
		};

		this.ReadMode();
		this.ListDocs();

		this.OnUiReady();

		setTimeout(()=> this.AfterResize(), 250);
	}

	OnUiReady(count = 0) {
		if (this.content.clientWidth === 0 && count < 200) {
			setTimeout(()=> this.OnUiReady(++count), 50);
		}
		else {
			this.UpdateAuthorization();
		}
	}

	AfterResize() { //override
		super.AfterResize();
		if (this.options.getBoundingClientRect().width < 260) {
			this.options.classList.add("doc-options-collapsed");
		}
		else {
			this.options.classList.remove("doc-options-collapsed");
		}
	}

	UpdateAuthorization() { //override
		//super.UpdateAuthorization();

		if (!KEEP.authorization.includes("*") && !KEEP.authorization.includes("documentation:write")) {
			this.newButton.disabled = true;
			this.editButton.disabled = true;
			this.deleteButton.disabled = true;
			this.saveButton.disabled = true;
			this.discardButton.disabled = true;
			return;
		}

		this.editButton.disabled = false;
		this.deleteButton.disabled = false;

		if (this.titleInput.value.length === 0) {
			this.editButton.disabled = true;
			this.deleteButton.disabled = true;
		}
	}

	async ListDocs() {
		this.params = { keywords: this.searchInput.value };
		try {
			let uri = this.searchInput.value.length === 0 ?
				"docs/list" :
				`docs/list?keywords=${encodeURIComponent(this.searchInput.value)}`;

			const response = await fetch(uri);

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);

			if (json.length > 0) {
				this.UpdateList(json);
			}
			else {
				this.titleInput.value = "";
				this.relatedBox.textContent = "";
				this.list.textContent = "";
			}
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
	}

	UpdateList(array) {
		this.titleInput.value = "";
		this.relatedBox.textContent = "";
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
			this.titleInput.value = "";
			this.relatedBox.textContent = "";
			this.contentBox.textContent = "";
			this.UpdateAuthorization();
			this.selected = null;
			return;
		}

		this.titleInput.value = name;
		this.UpdateAuthorization();

		try {
			const response = await fetch(`docs/view?name=${encodeURIComponent(name)}`);

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const text = await response.text();
			this.relatedBox.textContent = "";
			this.contentBox.innerHTML = text;

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

		this.newButton.style.display = "inline-block";
		this.editButton.style.display = "inline-block";
		this.deleteButton.style.display = "inline-block";
		this.saveButton.style.display = "none";
		this.discardButton.style.display = "none";

		this.titleInput.readOnly = true;

		this.relatedBox.classList.remove("doc-related-editable");
		this.relatedBox.style.right = "8px";
		this.addRelatedButton.style.opacity = "0";
		this.addRelatedButton.style.visibility = "hidden";
		this.contentBox.contentEditable = false;

		this.boldButton.style.opacity = "0";
		this.boldButton.style.visibility = "hidden";
		this.italicButton.style.opacity = "0";
		this.italicButton.style.visibility = "hidden";
		this.underlineButton.style.opacity = "0";
		this.underlineButton.style.visibility = "hidden";
		this.oListButton.style.opacity = "0";
		this.oListButton.style.visibility = "hidden";
		this.uListButton.style.opacity = "0";
		this.uListButton.style.visibility = "hidden";
		this.codeButton.style.opacity = "0";
		this.codeButton.style.visibility = "hidden";
		this.linkButton.style.opacity = "0";
		this.linkButton.style.visibility = "hidden";

		this.contentContainer.style.top = "104px";

		setTimeout(()=> this.AfterResize(), 400);
	}

	EditMode() {
		this.sidebar.style.transform = "translateX(-300px)";
		this.sidebar.style.filter = "opacity(0)";
		this.sidebar.style.visibility = "hidden";

		this.options.style.left = "4px";
		this.body.style.left = "4px";

		this.newButton.style.display = "none";
		this.editButton.style.display = "none";
		this.deleteButton.style.display = "none";
		this.saveButton.style.display = "inline-block";
		this.discardButton.style.display = "inline-block";

		this.titleInput.readOnly = false;

		this.relatedBox.classList.add("doc-related-editable");
		this.relatedBox.style.right = "36px";
		this.addRelatedButton.style.opacity = "1";
		this.addRelatedButton.style.visibility = "visible";
		this.contentBox.contentEditable = true;

		this.boldButton.style.opacity = "1";
		this.boldButton.style.visibility = "visible";
		this.italicButton.style.opacity = "1";
		this.italicButton.style.visibility = "visible";
		this.underlineButton.style.opacity = "1";
		this.underlineButton.style.visibility = "visible";
		this.oListButton.style.opacity = "1";
		this.oListButton.style.visibility = "visible";
		this.uListButton.style.opacity = "1";
		this.uListButton.style.visibility = "visible";
		this.codeButton.style.opacity = "1";
		this.codeButton.style.visibility = "visible";
		this.linkButton.style.opacity = "1";
		this.linkButton.style.visibility = "visible";

		this.contentContainer.style.top = "144px";

		setTimeout(()=> this.AfterResize(), 400);
	}

	New() {
		this.EditMode();

		this.contentBox.textContent = "";

		const table = document.createElement("table");
		this.contentBox.appendChild(table);

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

		this.contentBox.appendChild(document.createElement("br"));

		const desc = document.createElement("div");
		desc.textContent = "Description:";
		//desc.style.fontSize = "large";
		desc.style.fontWeight = 600;
		desc.style.textDecoration = "underline";
		this.contentBox.appendChild(desc);

		this.contentBox.appendChild(document.createElement("br"));
		this.contentBox.appendChild(document.createElement("br"));
		this.contentBox.appendChild(document.createElement("br"));


		this.titleInput.value = "";
		this.relatedBox.textContent = "";
		this.titleInput.focus();
	}

	Edit() {
		this.EditMode();
	}

	async Delete() {
		if (!this.selected) return;

		this.ConfirmBox("Are you sure you want to delete this document?").addEventListener("click", async ()=> {
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
		});
	}

	async Save() {
		if (this.titleInput.value.length == 0) {
			this.ConfirmBox("Please enter a title", true).addEventListener("click", ()=> this.titleInput.focus());
			return;
		}

		let nameLower = this.titleInput.value.toLowerCase();
		let exist = false;
		for (let i=0; i<this.list.childNodes.length; i++) {
			if (this.list.childNodes[i].textContent.toLowerCase() === nameLower) {
				exist = true;
				break;
			}
		}

		let payload = "";
		payload += this.titleInput.value + String.fromCharCode(127);
		payload += this.contentBox.innerHTML + String.fromCharCode(127);

		for (let i = 0; i < this.relatedBox.childNodes.length; i++) {
			payload += this.relatedBox.childNodes[i].getAttribute("file") + String.fromCharCode(127);
			payload += this.relatedBox.childNodes[i].style.backgroundImage + String.fromCharCode(127);
			payload += this.relatedBox.childNodes[i].getAttribute("label1") + String.fromCharCode(127);
			payload += this.relatedBox.childNodes[i].getAttribute("label2") + String.fromCharCode(127);
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
				const entry = this.AddToList(this.titleInput.value);
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

		const okButton = dialog.okButton;
		const cancelButton = dialog.cancelButton;
		const innerBox = dialog.innerBox;

		innerBox.style.padding = "8px";

		okButton.style.display = "none";

		const findInput = document.createElement("input");
		findInput.type = "text";
		findInput.placeholder = "Search";
		innerBox.appendChild(findInput);

		const devicesList = document.createElement("div");
		devicesList.className = "no-results";
		devicesList.style.position = "absolute";
		devicesList.style.left = devicesList.style.right = "0";
		devicesList.style.top = "48px";
		devicesList.style.bottom = "0";
		devicesList.style.overflowY = "auto";
		devicesList.style.overflowX = "hidden";
		innerBox.appendChild(devicesList);

		findInput.onchange = findInput.oninput = ()=> {
			devicesList.textContent = "";

			let keywords = [];
			if (findInput.value.trim().length > 0)
				keywords = findInput.value.trim().toLowerCase().split(" ");

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
				if ("name" in LOADER.devices.data[key]) {
					name = LOADER.devices.data[key]["name"].v;
				}
				else if ("hostname" in LOADER.devices.data[key]) {
					name = LOADER.devices.data[key]["hostname"].v;
				}
				else if ("ip" in LOADER.devices.data[key]) {
					name = LOADER.devices.data[key]["ip"].v;
				}

				let unique = "";
				if ("serial number" in LOADER.devices.data[key]) {
					unique = LOADER.devices.data[key]["serial number"].v;
				}
				else if ("mac address" in LOADER.devices.data[key]) {
					unique = LOADER.devices.data[key]["mac address"].v;
				}

				if (name.length === 0 && unique.length === 0) continue;

				let type = LOADER.devices.data[key]["type"];
				let iconUrl = `url(${LOADER.deviceIcons[type] ?? "mono/gear.svg"})`;

				const element = document.createElement("div");
				element.className = "list-element";
				devicesList.appendChild(element);

				const icon = document.createElement("div");
				icon.className = "list-element-icon";
				icon.style.backgroundImage = iconUrl;
				element.appendChild(icon);

				for (let i=0; i<devicesColumns.length; i++) {
					if (!(devicesColumns[i] in LOADER.devices.data[key])) continue;
					if (LOADER.devices.data[key][devicesColumns[i]].v.length === 0) continue;

					const newLabel = document.createElement("div");
					newLabel.textContent = LOADER.devices.data[key][devicesColumns[i]].v;
					newLabel.style.left = `calc(28px + ${i * 100 / devicesColumns.length}%)`;
					newLabel.style.width = `${100 / devicesColumns.length}%`;
					element.appendChild(newLabel);
				}

				element.ondblclick = ()=> {
					this.AddRelated(key, iconUrl, name, unique);
					cancelButton.onclick();
				};

				devicesList.appendChild(element);
			}
		};

		findInput.focus();
		findInput.onchange();
	}

	AddRelated(filename, icon, label1, label2) {
		const related = document.createElement("div");
		related.setAttribute("file", filename);
		related.setAttribute("label1", label1);
		related.setAttribute("label2", label2);
		related.style.backgroundImage = icon;
		this.relatedBox.appendChild(related);

		const removeButton = document.createElement("div");
		related.appendChild(removeButton);

		related.onclick = event=> {
			for (let j = 0; j < $w.array.length; j++)
				if ($w.array[j] instanceof Equip && $w.array[j].filename === filename) {
					$w.array[j].Minimize(); //minimize/restore
					return;
				}

			new Equip(filename);
			event.stopPropagation();
		};

		removeButton.onclick = event=> {
			event.stopPropagation();
			this.relatedBox.removeChild(related);
		};
	}
}