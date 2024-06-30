class View extends Window {
	constructor(args) {
		super();

		this.AddCssDependencies("view.css");

		this.lastWidthValue = 0;

		this.content.style.overflowY = "auto";
		this.content.style.containerType = "inline-size";

		this.InitializeComponents();

		setTimeout(()=>this.UpdateAuthorization(), 1);
	}

	AfterResize() { //overrides
		if (this.lastWidthValue < 1400 && this.content.clientWidth >= 1400) {
			this.infoPane.style.display = "initial";
			this.infoPane.append(this.liveA, this.liveB, this.liveC, this.liveD);
		}
		else if (this.lastWidthValue >= 1400 && this.content.clientWidth < 1400){
			this.infoPane.style.display = "none";
			this.scroll.append(this.liveA, this.liveB, this.liveC, this.attributes, this.liveD);
		}

		this.lastWidthValue = this.content.clientWidth;
	}

	UpdateAuthorization() { //overrides
		super.UpdateAuthorization();
		this.editButton.disabled = !KEEP.authorization.includes("*") && !KEEP.authorization.includes(`${this.dbTarget}s:write`);
		this.fetchButton.disabled = !KEEP.authorization.includes("*") && !KEEP.authorization.includes("fetch:write");
		this.copyButton.disabled = !KEEP.authorization.includes("*") && !KEEP.authorization.includes(`${this.dbTarget}s:write`);
		this.deleteButton.disabled = !KEEP.authorization.includes("*") && !KEEP.authorization.includes(`${this.dbTarget}s:write`);

		//this.InitializeAttributesList(this.link);
	}

	InitializeComponents() {
		this.bar = document.createElement("div");
		this.bar.className = "win-toolbar view-toolbar";
		this.content.appendChild(this.bar);

		this.timeline = document.createElement("div");
		this.timeline.style.display = "none";
		this.timeline.className = "view-timeline";
		this.content.appendChild(this.timeline);

		this.scroll = document.createElement("div");
		this.scroll.className = "view-scroll";
		this.content.appendChild(this.scroll);

		this.infoPane = document.createElement("div");
		this.infoPane.className = "view-info-pane";
		this.content.appendChild(this.infoPane);

		this.attributes = document.createElement("div");
		this.attributes.className = "view-attributes-list view-attributes-freeze";

		this.liveA = document.createElement("div");
		this.liveB = document.createElement("div");
		this.liveC = document.createElement("div");
		this.liveD = document.createElement("div");

		this.scroll.append(this.liveA, this.liveB, this.liveC, this.attributes, this.liveD);

		this.sortButton = this.AddToolbarButton("Order", "mono/sort.svg?light");
		this.sortButton.onclick = ()=> this.Sort();
		this.bar.appendChild(this.sortButton);

		this.infoButton = this.AddToolbarButton("Info", "mono/lamp.svg?light");
		this.infoButton.onclick = ()=> this.Info();
		this.bar.appendChild(this.infoButton);

		this.timelineButton = this.AddToolbarButton("Timeline", "mono/timeline.svg?light");
		this.timelineButton.onclick = ()=> this.Timeline();
		this.bar.appendChild(this.timelineButton);

		this.bar.appendChild(this.AddToolbarSeparator());

		this.editButton = this.AddToolbarButton("Edit", "mono/edit.svg?light");
		this.editButton.onclick = ()=> this.Edit();
		this.bar.appendChild(this.editButton);

		this.fetchButton = this.AddToolbarButton("Fetch", "mono/ball.svg?light");
		this.fetchButton.onclick = ()=> this.Fetch();
		this.bar.appendChild(this.fetchButton);

		this.copyButton = this.AddToolbarButton("Copy", "mono/copy.svg?light");
		this.copyButton.onclick = ()=> this.Copy();
		this.bar.appendChild(this.copyButton);

		this.deleteButton = this.AddToolbarButton("Delete", "mono/delete.svg?light");
		this.deleteButton.onclick = ()=> this.Delete();
		this.bar.appendChild(this.deleteButton);

		this.sideTools = document.createElement("div");
		this.sideTools.className = "view-side-tools";
		this.content.appendChild(this.sideTools);

		this.bar.appendChild(this.AddToolbarSeparator());
		this.AddSendToChatButton();
		this.bar.appendChild(this.sendChatButton);

		this.SetupFloatingMenu();
		this.floating.style.zIndex = "2";
	}

	CreateAttribute(name, value, origin, date, editMode=false) {
		const newAttribute = document.createElement("div");

		const nameBox = document.createElement("input");
		nameBox.type = "text";
		nameBox.value = name;
		nameBox.setAttribute("aria-label", "Attribute name");
		if (!editMode) nameBox.setAttribute("readonly", "true");
		newAttribute.appendChild(nameBox);

		const valueContainer = document.createElement("div");
		newAttribute.appendChild(valueContainer);

		const valueBox = document.createElement("input");
		valueBox.type = "text";
		valueBox.value = value;
		valueBox.setAttribute("aria-label", "Attribute value");
		if (!editMode) valueBox.setAttribute("readonly", "true");
		valueContainer.appendChild(valueBox);

		const removeButton = document.createElement("input");
		removeButton.type = "button";
		removeButton.tabIndex = "-1";
		removeButton.setAttribute("aria-label", "Remove attribute");
		newAttribute.appendChild(removeButton);

		const infoBox = document.createElement("div");
		newAttribute.appendChild(infoBox);

		if (date && origin) {
			const nowDate = new Date();
			const modDate = new Date(UI.TicksToUnixDate(date));

			let dateString, timeString;
			if (nowDate - modDate < 300000) {
				dateString = "Just now";
				timeString = null;
			}
			else if (nowDate.getUTCFullYear() === modDate.getUTCFullYear() && nowDate.getUTCMonth() === modDate.getUTCMonth() && nowDate.getUTCDate() === modDate.getUTCDate()) {
				dateString = "Today";
				timeString = modDate.toLocaleTimeString(UI.regionalFormat, {hour:"2-digit", minute:"2-digit"});
			}
			else {
				dateString = modDate.toLocaleDateString(UI.regionalFormat, {});
				timeString = modDate.toLocaleTimeString(UI.regionalFormat, {hour:"2-digit", minute:"2-digit"});
			}

			const dateBox = document.createElement("div");
			dateBox.textContent = `${dateString}${timeString ? ", " + timeString : ""}`;
			infoBox.appendChild(dateBox);

			const originBox = document.createElement("div");
			originBox.textContent = origin;
			infoBox.appendChild(originBox);
		}

		if (this instanceof DeviceView) {
			if (!this.attributeAutofill) {
				this.attributeAutofill = document.createElement("datalist");
				this.attributeAutofill.id = `attribute_autofill${Math.random()}`;
				this.content.appendChild(this.attributeAutofill);
				for (let i = 0; i < DeviceView.DEVICES_GROUP_SCHEMA.length; i++) {
					if (Array.isArray(DeviceView.DEVICES_GROUP_SCHEMA[i])) continue;
					const option = document.createElement("option");
					option.value = DeviceView.DEVICES_GROUP_SCHEMA[i];
					this.attributeAutofill.appendChild(option);
				}
			}

			nameBox.setAttribute("list", this.attributeAutofill.id);

			nameBox.oninput = ()=> {
				if (nameBox.value.toLowerCase() === "type") {
					valueBox.setAttribute("list", "device_type_autofill");
				}
				else {
					valueBox.removeAttribute("list");
				}
			};
			nameBox.oninput();

		}
		else if (this instanceof UserView) {
			if (!this.attributeAutofill) {
				this.attributeAutofill = document.createElement("datalist");
				this.attributeAutofill.id = `attribute_autofill${Math.random()}`;
				this.content.appendChild(this.attributeAutofill);
				for (let i = 0; i < UserView.USERS_GROUP_SCHEMA.length; i++) {
					if (Array.isArray(UserView.USERS_GROUP_SCHEMA[i])) continue;
					const option = document.createElement("option");
					option.value = UserView.USERS_GROUP_SCHEMA[i];
					this.attributeAutofill.appendChild(option);
				}
			}

			nameBox.setAttribute("list", this.attributeAutofill.id);

			nameBox.oninput = ()=> {
				const nameLowerCase = nameBox.value.toLowerCase();
				if (nameLowerCase === "type") {
					valueBox.setAttribute("list", "user_type_autofill");
				}
				else {
					valueBox.removeAttribute("list");
				}

				if (nameLowerCase.includes("password")) {
					valueBox.placeholder = "unchanged";
				}
				else {
					valueBox.placeholder = "";
				}
			};
			nameBox.oninput();
		}

		removeButton.onclick = ()=> {
			newAttribute.textContent = "";
			newAttribute.style.height = "0px";
			newAttribute.style.minHeight = "0px";
			setTimeout(()=> this.attributes.removeChild(newAttribute), 200);
		};

		if (name.toLowerCase().includes("password") && !editMode) {
			valueBox.value = "";
			valueBox.style.display = "none";

			const preview = document.createElement("div");
			preview.style.display = "none";
			preview.className = "view-password-preview";

			const showButton = document.createElement("input");
			showButton.type = "button";
			showButton.value = "Show";
			showButton.disabled = !KEEP.authorization.includes("*") && !KEEP.authorization.includes("passwords:read");

			const stampButton = document.createElement("input");
			stampButton.type = "button";
			stampButton.value = " ";
			stampButton.disabled = !KEEP.authorization.includes("*") && !KEEP.authorization.includes("passwords:read");
			stampButton.style.minWidth = "40px";
			stampButton.style.height = "32px";
			stampButton.style.backgroundImage = "url(mono/stamp.svg?light)";
			stampButton.style.backgroundSize = "28px 28px";
			stampButton.style.backgroundPosition = "center center";
			stampButton.style.backgroundRepeat = "no-repeat";

			valueContainer.append(preview, showButton, stampButton);

			showButton.onclick = async ()=> {
				try {
					const response = await fetch(`/db/${this.dbTarget}/attribute?file=${this.args.file}&attribute=${name}`);
					if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
					const password = await response.text();

					preview.textContent = password;
					preview.style.display = "inline-block";
					showButton.style.display = "none";

					setTimeout(()=> {
						if (!this.isClosed) {
							preview.textContent = "";
							preview.style.display = "none";
							showButton.style.display = "inline-block";
						}
					}, 15000);
				}
				catch (ex) {
					this.ConfirmBox(ex, true, "mono/error.svg");
				}
			};

			stampButton.onclick = async ()=> {
				try {
					const response = await fetch(`/db/${this.dbTarget}/attribute?file=${this.args.file}&attribute=${name}`);
					if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
					const password = await response.text();
					UI.PromptAgent(this, "stamp", password);
				}
				catch (ex) {
					this.ConfirmBox(ex, true, "mono/error.svg");
				}
			};
		}
		else if (value?.includes(";") && !editMode) {
			valueBox.style.display = "none";

			let split = value.split(";");
			for (let i = 0; i < split.length; i++) {
				split[i] = split[i].trim();
				if (split[i].length === 0) continue;

				const newBox = document.createElement("div");
				newBox.textContent = split[i];
				valueContainer.appendChild(newBox);
			}
		}

		return newAttribute;
	}

	CreateGroupTitle(icon, title) {
		const newGroup = document.createElement("div");
		newGroup.className = "view-attributes-group";

		newGroup.style.backgroundImage = icon === "." ? this.icon.style.backgroundImage : `url(${icon})`;
		newGroup.textContent = title;

		return newGroup;
	}

	InitializePreview() { //overridable
		this.InitializeAttributesList(this.link);
		this.InitializeSideTools();
		this.scroll.focus();
		setTimeout(()=> this.scroll.focus(), WIN.ANIME_DURATION);
	}

	InitializeAttributesList(hash, editMode = false) {
		this.attributes.textContent = "";

		if (this.order === "group") {
			let pushed = [];
			let nextGroup = null;
			for (let i = 0; i < this.groupSchema.length; i++) {
				if (Array.isArray(this.groupSchema[i])) {
					if (!editMode) {
						nextGroup = this.CreateGroupTitle(this.groupSchema[i][0], this.groupSchema[i][1]);
					}
				}
				else {
					if (!(this.groupSchema[i] in hash)) continue;

					if (nextGroup) {
						this.attributes.appendChild(nextGroup);
						nextGroup = null;
					}

					this.attributes.appendChild(
						this.CreateAttribute(this.groupSchema[i], hash[this.groupSchema[i]].v, hash[this.groupSchema[i]].o, hash[this.groupSchema[i]].d)
					);

					pushed.push(this.groupSchema[i]);
				}
			}

			if (!editMode) {
				nextGroup = this.CreateGroupTitle("mono/info.svg", "other");
			}

			for (let key in hash) {
				if (!pushed.includes(key)) {
					if (nextGroup) {
						this.attributes.appendChild(nextGroup);
						nextGroup = null;
					}

					const newAttr = this.CreateAttribute(key, hash[key].v, hash[key].o, hash[key].d);
					if (key.startsWith(".")) {
						if (!editMode) newAttr.style.display = "none";
						newAttr.style.color = "#404040";
					}
					this.attributes.appendChild(newAttr);
				}
			}
		}
		else {
			let sorted = [];
			for (let key in hash) {
				sorted.push(key);
			}
			sorted.sort((a, b)=> a.localeCompare(b));

			for (let i = 0; i < sorted.length; i++) {
				this.attributes.appendChild(
					this.CreateAttribute(sorted[i], hash[sorted[i]].v, hash[sorted[i]].o, hash[sorted[i]].d)
				);
			}
		}
	}

	InitializeSideTools() {} //overridable

	CreateInfoButton(text, icon) {
		const button = document.createElement("button");
		button.className = "view-live-button";
		button.style.backgroundImage = `url(${icon})`;

		const textLabel = document.createElement("div");
		textLabel.textContent = text;
		button.appendChild(textLabel);

		const secondary = document.createElement("div");
		secondary.style.fontSize = "small";
		button.appendChild(secondary);

		this.liveA.appendChild(button);
		return {
			button: button,
			label: textLabel,
			secondary: secondary
		};
	}

	CreateInfo(text, source) {
		const info = document.createElement("div");
		info.className = "view-info-box";
		info.textContent = text;
		info.setAttribute("source", source);
		this.liveB.append(info);
		return info;
	}

	CreateWarning(text, source) {
		const warning = document.createElement("div");
		warning.className = "view-warning-box";
		warning.textContent = text;
		warning.setAttribute("source", source);
		this.liveB.prepend(warning);
		return warning;
	}

	CreateSideButton(icon, label) {
		const button = document.createElement("button");
		button.style.backgroundImage = "url(" + icon + ")";
		button.textContent = label;
		this.sideTools.appendChild(button);
		return button;
	}

	Sort() {
		if (this.order === "alphabetical") {
			this.sortButton.style.borderBottom = "none";
			this.order = "group";
		}
		else {
			this.sortButton.style.borderBottom = "#c0c0c0 solid 3px";
			this.order = "alphabetical";
		}
		this.InitializeAttributesList(this.link);
	}

	Info() {
		if (this.attributes.classList.contains("view-attributes-with-info")) {
			this.infoButton.style.borderBottom = "none";
			this.attributes.classList.remove("view-attributes-with-info");
		}
		else {
			this.infoButton.style.borderBottom = "#c0c0c0 solid 3px";
			this.attributes.classList.add("view-attributes-with-info");
		}
	}

	async Timeline() { //overridable
		if (this.timeline.style.display !== "none") {
			this.InitializeAttributesList(this.link);
			this.timeline.style.display = "none";
			this.scroll.style.top = "48px";
			this.timelineButton.style.borderBottom = "none";
			this.sortButton.disabled = false;
			return;
		}

		if (this.timeline.firstChild) this.timeline.removeChild(this.timeline.firstChild);

		const innerTimeline = document.createElement("div");
		this.timeline.appendChild(innerTimeline);

		this.timeline.style.display = "initial";
		this.scroll.style.top = "96px";
		this.timelineButton.style.borderBottom = "#c0c0c0 solid 3px";
		this.sortButton.disabled = true;

		let json;
		try {
			const response = await fetch(`db/${this.dbTarget}/timeline?file=${this.args.file}`);

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			json = await response.json();
			if (json.error) throw (json.error);
		}
		catch (ex) {
			console.error(`timeline error: ${ex}`);
			return;
		}

		let sorted = [];

		sorted.push({
			time: Date.now(),
			obj: this.link
		});

		let min = Number.MAX_SAFE_INTEGER;
		let max = Date.now();

		for (const key in json) {
			let timestamp = UI.TicksToUnixDate(key);
			if (min > timestamp) min = timestamp;

			sorted.push({
				time: timestamp,
				obj: json[key]
			});
		}

		sorted.sort((a, b)=> b.time - a.time); //reversed


		let timeSpan = max - min;
		let lastStamp = Math.MAX_SAFE_INTEGER;
		let maxGap = { index: -1, length: 0 };

		for (let i = 0; i < sorted.length; i++) {
			let x = (sorted[i].time - min) * 100 / timeSpan;

			if (lastStamp - x < 1.66) x = lastStamp - 1.66;

			const con = document.createElement("div");
			con.className = "timeline-con";
			con.style.left = `calc(${x}% - 5px)`;
			innerTimeline.appendChild(con);

			const dot = document.createElement("div");
			dot.className = "timeline-dot";
			con.appendChild(dot);

			if (i === 0) {
				dot.style.backgroundColor = "var(--clr-accent)";
				dot.style.border = "2px solid #404040";
			}

			sorted[i].x = x;
			sorted[i].con = con;

			let gap = lastStamp - x;
			if (maxGap.length < gap) maxGap = { index: i, length: gap };
			lastStamp = x;

			con.onmouseenter = ()=> {
				this.floating.textContent = "";
				this.floating.style.visibility = "visible";
				this.floating.style.opacity = "1";

				let left = this.timeline.offsetLeft + con.offsetLeft - 72.5;
				if (left < 0) left = 0;
				if (left + 225 > this.content.offsetWidth) left = this.content.offsetWidth - 225;
				this.floating.style.left = `${left}px`;
				this.floating.style.top = `${this.timeline.offsetTop + 44}px`;

				let date = new Date(sorted[i].time);
				let added = 0, modified = 0, unchanged = 0, removed = 0;

				if (i === sorted.length - 1) {
					for (let key in sorted[i].obj) {
						added++;
					}
				}
				else {
					for (let key in sorted[i].obj) {
						if (key.includes("password")) continue;

						if (key in sorted[i+1].obj) {
							if (sorted[i].obj[key].v === sorted[i + 1].obj[key].v) {
								unchanged++;
							}
							else {
								modified++;
							}
						}
						else {
							added++;
						}
					}

					for (let key in sorted[i + 1].obj) {
						if (key.includes("password")) continue;
						if (!(key in sorted[i].obj)) {
							removed++;
						}
					}
				}

				const dateBox = document.createElement("div");
				dateBox.style.textDecoration = "underline";
				dateBox.style.fontWeight = "600";
				dateBox.style.textAlign = "center";
				dateBox.style.marginTop = "4px";
				dateBox.style.marginBottom = "4px";
				dateBox.textContent = `${date.toLocaleDateString(UI.regionalFormat, {})} ${date.toLocaleTimeString(UI.regionalFormat, {})}`;
				this.floating.appendChild(dateBox);

				if (added > 0) {
					const addedBox = document.createElement("div");
					addedBox.style.backgroundImage = "url(mono/add.svg)";
					addedBox.style.backgroundSize = "16px 16px";
					addedBox.style.backgroundPosition = "4px 50%";
					addedBox.style.backgroundRepeat = "no-repeat";
					addedBox.style.margin = "2px";
					addedBox.style.paddingLeft = "24px";
					addedBox.textContent = `${added} added`;
					this.floating.appendChild(addedBox);
				}

				if (modified > 0) {
					const modBox = document.createElement("div");
					modBox.style.backgroundImage = "url(mono/edit.svg)";
					modBox.style.backgroundSize = "16px 16px";
					modBox.style.backgroundPosition = "4px 50%";
					modBox.style.backgroundRepeat = "no-repeat";
					modBox.style.margin = "2px";
					modBox.style.paddingLeft = "24px";
					modBox.textContent = `${modified} modified`;
					this.floating.appendChild(modBox);
				}

				if (removed > 0) {
					const removedBox = document.createElement("div");
					removedBox.style.backgroundImage = "url(mono/delete.svg)";
					removedBox.style.backgroundSize = "16px 16px";
					removedBox.style.backgroundPosition = "4px 50%";
					removedBox.style.backgroundRepeat = "no-repeat";
					removedBox.style.margin = "2px";
					removedBox.style.paddingLeft = "24px";
					removedBox.textContent = `${removed} removed`;
					this.floating.appendChild(removedBox);
				}
			};

			con.onmouseleave = ()=> {
				this.floating.style.visibility = "hidden";
				this.floating.style.opacity = "0";

				let left = this.floating.offsetLeft + this.floating.offsetWidth;
				if (left > this.content.offsetWidth - this.floating.offsetWidth - 8) {
					this.floating.style.left = `${this.timeline.offsetLeft + this.timeline.offsetWidth - this.floating.offsetWidth - 8}px`;
				}
			};

			con.onclick = ()=> {
				innerTimeline.childNodes.forEach(o=> o.firstChild.style.backgroundColor = "#404040");
				innerTimeline.childNodes.forEach(o=> o.firstChild.style.border = "none");
				innerTimeline.childNodes[i].firstChild.style.backgroundColor = "var(--clr-accent)";
				innerTimeline.childNodes[i].firstChild.style.border = "2px solid #404040";

				this.InitializeAttributesList(sorted[i].obj);

				if (i === sorted.length - 1) {
					for (let j=0; j<this.attributes.childNodes.length; j++) {
						if (this.attributes.childNodes[j].childNodes.length < 2) continue;
						if (this.attributes.childNodes[j].childNodes[0].value.includes("password")) {
							this.attributes.childNodes[j].style.backgroundImage = "url(mono/lock.svg)";
						}
						else {
							this.attributes.childNodes[j].style.backgroundImage = "url(mono/add.svg)";
						}
					}
				}
				else {
					for (let j=0; j<this.attributes.childNodes.length; j++) {
						if (this.attributes.childNodes[j].childNodes.length < 2) continue;

						if (this.attributes.childNodes[j].childNodes[0].value.includes("password")) {
							this.attributes.childNodes[j].style.backgroundImage = "url(mono/lock.svg)";
							continue;
						}

						let key = this.attributes.childNodes[j].childNodes[0].value;
						if (key in sorted[i+1].obj) {
							if (this.attributes.childNodes[j].childNodes[1].firstChild.value !== sorted[i+1].obj[key].v) {
								this.attributes.childNodes[j].style.backgroundImage = "url(mono/edit.svg)";
							}
						}
						else {
							this.attributes.childNodes[j].style.backgroundImage = "url(mono/add.svg)";
						}
					}
				}
			};
		}

		this.timeline.onmouseenter = ()=> { this.floating.style.display = "initial"; };
		this.timeline.onmouseleave = ()=> { this.floating.style.display = "none"; };

		//TODO: need a better way
		if (lastStamp < 0 && maxGap.length > 3) {
			let diff = Math.abs(lastStamp);
			if (diff > maxGap) diff = maxGap - 2;
			for (let i = maxGap.index; i < sorted.length; i++) {
				sorted[i].con.style.left = `calc(${sorted[i].x + diff}% - 5px)`;
			}
		}
	}

	Edit(isNew=false) { //overridable
		if (this.attributes.classList.contains("view-attributes-with-info")) {
			this.Info();
		}

		if (this.timeline.style.display !== "none") {
			this.Timeline();
		}

		for (let i = 0; i < this.bar.childNodes.length; i++) {
			this.bar.childNodes[i].style.display = "none";
		}

		for (let i=0; i<this.sideTools.childNodes.length; i++) {
			this.sideTools.childNodes[i].disabled = true;
		}

		this.liveA.style.display = "none";
		this.liveB.style.display = "none";
		this.liveC.style.display = "none";
		this.liveD.style.display = "none";

		const UpdateIndicators = (nameInput, valueInput)=> {
			let key = nameInput.value.toLowerCase();
			if (key in this.link) {
				if (valueInput.value === this.link[key].v) { //same
					valueInput.style.backgroundImage = "none";
					valueInput.style.paddingLeft = "8px";
				}
				else { //changed
					valueInput.style.backgroundImage = "url(mono/edit.svg)";
					valueInput.style.paddingLeft = "32px";
				}
			}
			else { //new
				valueInput.style.backgroundImage = "url(mono/add.svg)";
				valueInput.style.paddingLeft = "32px";
			}
		}
		
		for (let i = 0; i < this.attributes.childNodes.length; i++) {
			const attribute = this.attributes.childNodes[i];
			attribute.style.display = "inherit";

			if (attribute.childNodes.length < 2) {
				attribute.textContent = "";
				attribute.style.height = "0px";
				attribute.style.marginTop = "0px";
			}
			else {
				while (attribute.childNodes[1].childNodes.length > 1) {
					attribute.childNodes[1].removeChild(attribute.childNodes[1].lastChild);
				}
				attribute.childNodes[1].firstChild.style.display = "initial";
			}

			//update indicators on value-change
			if (!isNew && attribute.childNodes.length > 1) {
				const nameInput = attribute.firstChild;
				const valueInput = attribute.childNodes[1].firstChild;
				nameInput.onchange = valueInput.onchange = ()=> UpdateIndicators(nameInput, valueInput);
			}
		}

		const saveButton = document.createElement("input");
		saveButton.type = "button";
		saveButton.value = "Save";
		saveButton.className = "with-icon";
		saveButton.style.backgroundImage = "url(mono/floppy.svg?light)";
		saveButton.style.margin = "6px";
		this.bar.appendChild(saveButton);

		const revertButton = document.createElement("input");
		revertButton.type = "button";
		revertButton.value = "Revert";
		revertButton.className = "with-icon";
		revertButton.style.backgroundImage = "url(mono/restart.svg?light)";
		revertButton.style.margin = "6px";
		this.bar.appendChild(revertButton);
		if (isNew) revertButton.disabled = "true";

		const cancelButton = document.createElement("input");
		cancelButton.type = "button";
		cancelButton.value = "Cancel";
		cancelButton.className = "with-icon";
		cancelButton.style.backgroundImage = "url(mono/clear.svg?light)";
		cancelButton.style.margin = "6px";
		this.bar.appendChild(cancelButton);

		const addAttributeButton = document.createElement("input");
		addAttributeButton.type = "button";
		addAttributeButton.value = "Add attribute";
		addAttributeButton.className = "with-icon";
		addAttributeButton.style.backgroundImage = "url(mono/add.svg?light)";
		addAttributeButton.style.margin = "6px";
		addAttributeButton.style.float = "right";
		this.bar.appendChild(addAttributeButton);

		this.attributes.classList.remove("view-attributes-freeze");

		for (let i = 0; i < this.attributes.childNodes.length; i++) {
			if (this.attributes.childNodes[i].childNodes.length < 3) continue;
			this.attributes.childNodes[i].childNodes[0].removeAttribute("readonly");
			this.attributes.childNodes[i].childNodes[1].firstChild.removeAttribute("readonly");
		}

		addAttributeButton.onclick = ()=> {
			const newAttribute = this.CreateAttribute("", "", KEEP.username, new Date(), true);
			newAttribute.style.animation = "attribute-in .2s 1";
			this.attributes.appendChild(newAttribute);
			newAttribute.scrollIntoView({ block: "end" });
			newAttribute.childNodes[0].focus();

			if (!isNew) {
				const nameInput = newAttribute.firstChild;
				const valueInput = newAttribute.childNodes[1].firstChild;
				nameInput.onchange = valueInput.onchange = ()=> UpdateIndicators(nameInput, valueInput);
			}
		};

		const ExitEdit = ()=> {
			this.bar.removeChild(saveButton);
			this.bar.removeChild(revertButton);
			this.bar.removeChild(cancelButton);
			this.bar.removeChild(addAttributeButton);

			for (let i = 0; i < this.bar.childNodes.length; i++) {
				this.bar.childNodes[i].style.display = "initial";
			}

			for (let i=0; i<this.sideTools.childNodes.length; i++) {
				this.sideTools.childNodes[i].disabled = false;
			}

			this.liveA.style.display = "block";
			this.liveB.style.display = "block";
			this.liveC.style.display = "block";
			this.liveD.style.display = "block";

			this.attributes.classList.add("view-attributes-freeze");

			for (let i = 0; i < this.attributes.childNodes.length; i++) {
				if (this.attributes.childNodes[i].childNodes.length < 3) continue;
				this.attributes.childNodes[i].childNodes[0].setAttribute("readonly", "true");
				this.attributes.childNodes[i].childNodes[1].firstChild.setAttribute("readonly", "true");
			}
		};

		const Revert = editMode=> {
			this.InitializeAttributesList(this.link, editMode);
			for (let i = 0; i < this.attributes.childNodes.length; i++) {
				if (this.attributes.childNodes[i].childNodes.length < 3) continue;
				this.attributes.childNodes[i].childNodes[0].removeAttribute("readonly");
				this.attributes.childNodes[i].childNodes[1].firstChild.removeAttribute("readonly");

				while (this.attributes.childNodes[i].childNodes[1].childNodes.length > 1) {
					this.attributes.childNodes[i].childNodes[1].removeChild(this.attributes.childNodes[i].childNodes[1].lastChild);
				}
				this.attributes.childNodes[i].childNodes[1].firstChild.style.display = "initial";
			}
		};

		saveButton.onclick = ()=> ExitEdit();

		revertButton.onclick = ()=> Revert(true);

		cancelButton.onclick = ()=> {
			if (isNew) {
				this.Close();
			}
			else {
				this.InitializeAttributesList(this.link, false);
				ExitEdit();
			}
		};

		return saveButton;
	}

	Fetch() {} //overridable

	Copy() {} //overridable

	Delete() {} //overridable
}