class AddressBook extends Window {
	constructor(params) {
		super();

		this.params = params ?? {view:"card", search:""};

		this.AddCssDependencies("addressbook.css");

		this.SetTitle("Address book");
		this.SetIcon("mono/addressbook.svg");

		const qrLib = document.createElement("script");
		qrLib.src = "qrcode.js";
		this.win.appendChild(qrLib);

		this.contacts = [];
		this.lastSearch = null;

		this.content.style.overflowY = "scroll";

		this.searchBar = document.createElement("div");
		this.searchBar.className = "address-book-search-bar";

		this.list = document.createElement("div");
		this.list.className = "address-book-list card";

		this.content.append(this.searchBar, this.list);

		this.searchBox = document.createElement("input");
		this.searchBox.type = "text";
		this.searchBox.placeholder = "Search...";
		this.searchBox.className = "address-book-search-box";

		this.frequentWords = document.createElement("div");
		this.frequentWords.className = "address-book-frequent";

		this.downloadButton = document.createElement("div");
		this.downloadButton.classList = "address-book-button";
		this.downloadButton.style.right = "64px";
		this.downloadButton.style.backgroundImage = "url(/mono/download.svg?light)";
		this.downloadButton.tabIndex = "0";
		this.downloadButton.onclick = ()=>{ this.DownloadContacts() };

		this.viewButton = document.createElement("div");
		this.viewButton.classList = "address-book-button";
		this.viewButton.style.right = "8px";
		this.viewButton.tabIndex = "0";
		this.viewButton.onclick = ()=>{ this.ToggleView() };

		for (let i=0; i<6; i++) {
			const item = document.createElement("div");
			item.style.left = `${4+(i%2)*22}px`;
			item.style.top = `${5+(i%3)*14}px`;
			item.style.width = "17px";
			item.style.height = "10px";
			this.viewButton.appendChild(item);
		}

		this.searchBar.append(this.searchBox, this.frequentWords, this.viewButton, this.downloadButton);

		this.searchBox.value = this.params.search;
		
		if (this.params.view === "list") {
			this.ViewAsList();
		}

		this.GetContacts();

		this.defaultElement = this.searchBox;

		this.searchBox.oninput = this.onchange = event=> this.SearchBox_onchange(event);

		this.searchBox.onkeydown = event=> {
			if (event.key === "Escape") {
				this.searchBox.value = "";
				this.searchBox.oninput();
			}
		};
	}

	async GetContacts() {
		let json;
		try {
			const response = await fetch("contacts");

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
			
			json = await response.json();
			if (json.error) throw(json.error);

			json = json.sort((a, b)=> {
				if (a.hasOwnProperty("title") && b.hasOwnProperty("title")) return a.title.toLowerCase() > b.title.toLowerCase();
				if (!a.hasOwnProperty("title") && !b.hasOwnProperty("title")) return 0;
				if (!a.hasOwnProperty("title")) return -1;
				if (!b.hasOwnProperty("title")) return 1;
			});

			this.contacts = json;
		}
		catch (ex) {
			this.ConfirmBox(ex, true, "mono/error.svg");
		}

		this.RefreshList();
	}

	SearchBox_onchange() {
		if (this.lastSearch === this.searchBox.value.trim()) return;
		this.lastSearchValue = this.searchBox.value.trim();
	
		let current = this.searchBox.value;
		setTimeout(()=> {
			if (current !== this.searchBox.value) return;
			this.RefreshList();
		}, 200);

		this.params.search = this.searchBox.value;
	}

	Contact_onclick(element, index) {
		const dim = document.createElement("div");
		dim.className = "win-dim";
		dim.style.top = "0";
		dim.style.backgroundColor = "rgba(32,32,32,.25)";
		dim.style.animation = "fade-in .2s 1";
		dim.style.zIndex = "2";

		if (this.popOutWindow) {
			this.popOutWindow.document.body.appendChild(dim);
			dim.style.top = "0";
		}
		else {
			this.win.appendChild(dim);
		}

		if (this.params.view === "card")
			element.style.opacity = "0";

		const preview = document.createElement("div");
		preview.className = "address-book-preview";
		if (this.params.view === "card") {
			preview.style.width = `${element.clientWidth*2}px`;
			preview.style.height = `${element.clientHeight*2}px`;
			preview.style.left = `${element.offsetLeft - element.clientWidth/2}px`;
			preview.style.top = `${element.offsetTop - this.content.scrollTop - element.clientHeight/2}px`;
			preview.style.transform = "scale(50%)";
		}
		else {
			preview.style.width = "500px";
			preview.style.height = "320px";
			preview.style.left = "calc(50% - 250px)";
			preview.style.top = `${element.offsetTop - this.content.scrollTop - 160}px`;
			preview.style.transform = "scaleY(5%)";
		}

		dim.appendChild(preview);

		const title = document.createElement("div");
		title.textContent = this.contacts[index].title ?? "--";
		title.className = "title";
		preview.appendChild(title);

		if (this.contacts[index].name) {
			const label = document.createElement("div");
			label.textContent = this.contacts[index].name;
			label.className = "name";
			preview.appendChild(label);
		}

		if (this.contacts[index].department) {
			const label = document.createElement("div");
			label.textContent = this.contacts[index].department;
			label.className = "department";
			preview.appendChild(label);
		}

		let qrList = [];

		if (this.contacts[index].email) {
			let values = this.contacts[index].email.split(";");
			for (let i=0; i<values.length; i++) {
				const trimmed = values[i].trim();
				if (trimmed.length === 0) continue;
				const label = document.createElement("a");
				label.textContent = trimmed;
				label.href = `mailto:${trimmed}`;
				label.className = "email";
				preview.appendChild(label);
				qrList.push(trimmed);
			}
		}

		if (this.contacts[index].telephone) {
			let values = this.contacts[index].telephone.split(";");
			for (let i=0; i<values.length; i++) {
				const trimmed = values[i].trim();
				if (trimmed.length === 0) continue;
				const label = document.createElement("a");
				label.textContent = trimmed;
				label.href = `tel:${trimmed}`;
				label.className = "telephone";
				preview.appendChild(label);
				if (values[i].length > 7) {
					qrList.push(trimmed);
				}
			}
		}

		if (this.contacts[index].mobile) {
			let values = this.contacts[index].mobile.split(";");
			for (let i=0; i<values.length; i++) {
				const trimmed = values[i].trim();
				if (trimmed.length === 0) continue;
				const label = document.createElement("a");
				label.textContent = trimmed;
				label.href = `tel:${trimmed}`;
				label.className = "mobile";
				preview.appendChild(label);
				qrList.push(trimmed);
			}
		}

		if (qrList.length > 0) {
			const qrButton = document.createElement("div");
			qrButton.className = "qr-icon";
			preview.appendChild(qrButton);

			preview.style.scrollSnapType = "y mandatory";
			preview.style.scrollSnapAlign = "bottom";
			
			const BuildQrCode = (value, label, type, size=150)=> {
				const qrContainer = document.createElement("div");
				qrContainer.className = "address-book-qrcode";
				preview.appendChild(qrContainer);

				const qrBox = document.createElement("div");
				qrContainer.appendChild(qrBox);

				new QRCode(qrBox, {
					text: type==="vcard" ? value : `${type}:${value}`,
					width: size,
					height: size,
					colorDark : "#202020",
					colorLight : "transparent",
					correctLevel : QRCode.CorrectLevel.L
				});

				const qrText = document.createElement("div");
				qrText.textContent = label;
				qrBox.appendChild(qrText);

				return qrContainer;
			};

			qrButton.onclick = ()=>{
				qrButton.style.display = "none";
				for (let i=qrList.length-1; i>=0; i--) {
					BuildQrCode(qrList[i], qrList[i], qrList[i].includes("@") ? "mailto" : "tel");
				}

				const NL = String.fromCharCode(13) + String.fromCharCode(10);
				let vCard = "";
				vCard += "BEGIN:VCARD" + NL;
				vCard += "VERSION:2.1" + NL;
	
				if (this.contacts[index].name && this.contacts[index].name.length > 0) {
					let split = this.contacts[index].name.split(" ");
					if (split.length > 1) {
						vCard += "N:" + split[0] + ";" + split[1] + ";;" + NL;
						vCard += "FN:" + split[0] + " " + split[1] + NL;
					}
					else {
						vCard += "FN:" + this.contacts[index].name + NL;
					}
				}
				else {
					vCard += "FN:" + this.contacts[index].title + NL;
				}
	
				if (this.contacts[index].title && this.contacts[index].title.length > 0) vCard += "TITLE:" + this.contacts[index].title + NL;
				if (this.contacts[index].department && this.contacts[index].department.length > 0) vCard += "ORG:" + this.contacts[index].department + NL;
				if (this.contacts[index].email && this.contacts[index].email.length > 0) vCard += "EMAIL:" + this.contacts[index].email + NL;
	
				if (this.contacts[index].telephone) {
					let telephone = this.contacts[index].telephone.split(";").map(o=>o.trim());
					for (let j=0; j<telephone.length; j++) {
						vCard += "TEL;WORK:" + telephone[j].replace(" ", "") + NL;
					}
				}
	
				if (this.contacts[index].mobile) {
					let mobile = this.contacts[index].mobile.split(";").map(o=>o.trim());
					for (let j=0; j<mobile.length; j++) {
						vCard += "TEL;CELL:" + mobile[j].replace(" ", "") + NL;
					}
				}
	
				vCard += "END:VCARD" + NL;
	
				const vCardContainer = BuildQrCode(vCard, "Save contact", "vcard", 220);
				vCardContainer.firstChild.style.width = "220px";
			};
		}

		const closeButton = document.createElement("div");
		closeButton.className = "address-book-close-button";
		dim.appendChild(closeButton);

		setTimeout(()=>{
			preview.style.transition = ".25s";
			preview.style.width = "500px";
			preview.style.height = "320px";
			preview.style.left = `calc(50% - 250px)`;
			preview.style.top = `calc(50% - 160px)`;
			preview.style.transform = "scale(100%)";
		}, 0);

		dim.onclick = ()=> {
			dim.onclick = ()=>{};

			dim.style.background = "rgba(0,0,0,0)";
			dim.style.transition = ".2s";

			preview.style.transition = ".2s";
			closeButton.style.opacity = "0";

			if (this.params.view === "card") {
				preview.style.width = `${element.clientWidth*2}px`;
				preview.style.height = `${element.clientHeight*2}px`;
				preview.style.left = `${element.offsetLeft - element.clientWidth/2}px`;
				preview.style.top = `${element.offsetTop - this.content.scrollTop - element.clientHeight/2}px`;
				preview.style.transform = "scale(50%)";
			}
			else {
				preview.style.transform = "scaleY(5%)";
			}

			setTimeout(()=>{
				element.style.opacity = "1";
				dim.parentElement.removeChild(dim)
			}, 200);
		};

		dim.onmouseup = dim.onmousedown = event=> {
			event.stopPropagation();
			this.BringToFront();
		};

		preview.onclick = event=> event.stopPropagation();
		
	}

	RefreshList() {
		this.frequentWords.textContent = "";
		this.list.textContent = "";

		let words = this.searchBox.value.toLowerCase().split(" ").filter(o=>o.length > 0);
		let wordsCounter = {};

		const CountWords = string=> {
			const split = string.split(" ").filter(o=>o.length > 0);
			for (let i=0; i<split.length; i++) {
				if (split[i].length < 3) return;
				if (!wordsCounter[split[i]]) wordsCounter[split[i]] = 0;
				wordsCounter[split[i]]++;
			}
		};

		for (let i=0; i<this.contacts.length; i++) {
		
			let isMatched = true;
			for (let j=0; j<words.length; j++) {
				let found = false;
				for (let attr in this.contacts[i]) {
					const value = this.contacts[i][attr].toLowerCase();
					if (value.indexOf(words[j]) > -1) {
						found = true;
						break;
					}
				}
				if (!found) {
					isMatched = false;
					break;
				}
			}
			
			if (!isMatched) continue;

			if (this.contacts[i].title) CountWords(this.contacts[i].title);
			if (this.contacts[i].name) CountWords(this.contacts[i].name);
			if (this.contacts[i].department) CountWords(this.contacts[i].department);

			const contact = document.createElement("div");

			const title = document.createElement("div");
			title.textContent = this.contacts[i].title ?? "--";
			title.className = "title";
			contact.appendChild(title);

			if (this.contacts[i].name) {
				const label = document.createElement("div");
				label.textContent = this.contacts[i].name;
				label.className = "name";
				contact.appendChild(label);
			}

			if (this.contacts[i].department) {
				const label = document.createElement("div");
				label.textContent = this.contacts[i].department;
				label.className = "department";
				contact.appendChild(label);
			}

			if (this.contacts[i].email) {
				const label = document.createElement("div");
				label.textContent = this.contacts[i].email.split(";")[0];
				label.className = "email";
				contact.appendChild(label);
			}

			if (this.contacts[i].telephone) {
				const label = document.createElement("div");
				label.textContent = this.contacts[i].telephone.split(";")[0];
				label.className = "telephone";
				contact.appendChild(label);
			}

			if (this.contacts[i].mobile) {
				const label = document.createElement("div");
				label.textContent = this.contacts[i].mobile.split(";")[0];
				label.className = "mobile";
				contact.appendChild(label);
			}

			this.list.appendChild(contact);
			contact.onclick = ()=> this.Contact_onclick(contact, i);
		}

		let keys = Object.keys(wordsCounter).sort((a, b)=> wordsCounter[b] - wordsCounter[a]);
		for (let i=0; i<Math.min(keys.length, 24); i++) {
			if (words.includes(keys[i].toLowerCase())) continue;
			const element = document.createElement("div");
			element.textContent = keys[i];
			this.frequentWords.appendChild(element);

			element.onclick = ()=>{
				this.searchBox.value = `${this.searchBox.value} ${keys[i]}`.trim();
				this.params.search = this.searchBox.value;
				this.RefreshList();
			};
		}
	}

	DownloadContacts() {
		const NL = String.fromCharCode(13) + String.fromCharCode(10);

		let text = "";
		let words = this.searchBox.value.toLowerCase().split(" ").filter(o=>o.length > 0);

		for (let i=0; i<this.contacts.length; i++) {
			let isMatched = true;
			for (let j=0; j<words.length; j++) {
				let found = false;
				for (let attr in this.contacts[i]) {
					const value = this.contacts[i][attr].toLowerCase();
					if (value.indexOf(words[j]) > -1) {
						found = true;
						break;
					}
				}
				if (!found) {
					isMatched = false;
					break;
				}
			}
			
			if (!isMatched) continue;


			text += "BEGIN:VCARD" + NL;
			text += "VERSION:2.1" + NL;

			if (this.contacts[i].name && this.contacts[i].name.length > 0) {
				let split = this.contacts[i].name.split(" ");
				if (split.length > 1) {
					text += "N:" + split[0] + ";" + split[1] + ";;" + NL;
					text += "FN:" + split[0] + " " + split[1] + NL;
				}
				else {
					text += "FN:" + this.contacts[i].name + NL;
				}
			}
			else {
				text += "FN:" + this.contacts[i].title + NL;
			}

			if (this.contacts[i].title && this.contacts[i].title.length > 0) text += "TITLE:" + this.contacts[i].title + NL;
			if (this.contacts[i].department && this.contacts[i].department.length > 0) text += "ORG:" + this.contacts[i].department + NL;
			if (this.contacts[i].email && this.contacts[i].email.length > 0) text += "EMAIL:" + this.contacts[i].email + NL;

			if (this.contacts[i].telephone) {
				let telephone = this.contacts[i].telephone.split(";").map(o=>o.trim());
				for (let j=0; j<telephone.length; j++) {
					text += "TEL;WORK:" + telephone[j].replace(" ", "") + NL;
				}
			}

			if (this.contacts[i].mobile) {
				let mobile = this.contacts[i].mobile.split(";").map(o=>o.trim());
				for (let j=0; j<mobile.length; j++) {
					text += "TEL;CELL:" + mobile[j].replace(" ", "") + NL;
				}
			}

			text += "END:VCARD" + NL + NL;
		}

		const pseudo = document.createElement("a");
		pseudo.style.display = "none";
		document.body.appendChild(pseudo);

		let filename = (this.searchBox.value.length == 0) ?
			"All contacts" :
			"contacts_" + this.searchBox.value;

		pseudo.setAttribute("href", "data:text/vcard;charset=utf-8," + encodeURI(text));
		pseudo.setAttribute("download", filename + ".vcf");

		pseudo.click(null);

		document.body.removeChild(pseudo);
	}

	ToggleView() {
		if (this.params.view === "list") {
			this.params.view = "card";
			this.ViewAsCards();
		}
		else {
			this.params.view = "list";
			this.ViewAsList();
		}
	}

	ViewAsCards() {
		this.list.classList.remove("list");
		this.list.classList.add("card");
		for (let i=0; i<6; i++) {
			this.viewButton.childNodes[i].style.left = `${4+(i%2)*22}px`;
			this.viewButton.childNodes[i].style.top = `${5+(i%3)*14}px`;
			this.viewButton.childNodes[i].style.width = "17px";
			this.viewButton.childNodes[i].style.height = "10px";
		}
	}

	ViewAsList() {
		this.list.classList.remove("card");
		this.list.classList.add("list");
		for (let i=0; i<6; i++) {
			this.viewButton.childNodes[i].style.left = "4px";
			this.viewButton.childNodes[i].style.top = `${4+i*7}px`;
			this.viewButton.childNodes[i].style.width = "40px";
			this.viewButton.childNodes[i].style.height = "4px";
		}
	}
}