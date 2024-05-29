class About extends Tabs {
	constructor(args) {
		super(null);

		this.args = args ?? "";

		this.SetTitle("About");
		this.SetIcon("mono/logo.svg");

		this.tabsPanel.style.padding = "24px";
		this.tabsPanel.style.overflowY = "auto";

		this.aboutTab     = this.AddTab("About", "mono/logo.svg");
		this.legalTab     = this.AddTab("Legal", "mono/law.svg");
		this.updateTab    = this.AddTab("Update", "mono/update.svg");
		this.updateModTab = this.AddTab("Update modules", "mono/department.svg");

		this.aboutTab.onclick = ()=> this.ShowAbout();
		this.legalTab.onclick = ()=> this.ShowLegal();
		this.updateTab.onclick = ()=> this.ShowUpdate();
		this.updateModTab.onclick = ()=> this.ShowUpdateModules();

		switch (this.args) {
		case "legal":
			this.legalTab.className = "v-tab-selected";
			this.ShowLegal();
			break;

		case "update":
			this.updateTab.className = "v-tab-selected";
			this.ShowUpdate();
			break;

		case "updatemod":
			this.updateModTab.className = "v-tab-selected";
			this.ShowUpdateModules();
			break;

		default:
			this.aboutTab.className = "v-tab-selected";
			this.ShowAbout();
		}
	}

	async ShowAbout() {
		this.args = "about";
		this.tabsPanel.textContent = "";

		const aboutBox = document.createElement("div");
		aboutBox.style.padding = "16px";
		aboutBox.style.display = "grid";
		aboutBox.style.gridTemplateColumns = "auto 150px 200px auto";
		aboutBox.style.gridTemplateRows = "repeat(6, 24px)";
		aboutBox.style.alignItems = "end";
		aboutBox.style.userSelect = "text";
		this.tabsPanel.appendChild(aboutBox);

		const logo = document.createElement("img");
		logo.style.gridArea = "1 / 2 / 6 / 2";
		logo.style.userSelect = "none";
		logo.style.userDrag = "none";
		logo.style.webkitUserDrag = "none";
		logo.width = "128";
		logo.height = "128";
		logo.src = "mono/logo.svg";
		aboutBox.appendChild(logo);

		const name = document.createElement("div");
		name.style.gridArea = "2 / 3";
		name.style.fontWeight = "600";
		name.textContent = "Pro-test";
		aboutBox.appendChild(name);

		const version = document.createElement("div");
		version.style.gridArea = "3 / 3";
		version.style.fontWeight = "500";
		version.textContent = `Version ${KEEP.version}`;
		aboutBox.appendChild(version);

		const description = document.createElement("div");
		description.style.fontWeight = "500";
		description.style.textAlign = "center";
		description.style.userSelect = "text";
		description.textContent = "A management base for System Admins";
		this.tabsPanel.appendChild(description);

		const center = document.createElement("div");
		center.style.textAlign = "center";
		this.tabsPanel.appendChild(center);

		const opensource = document.createElement("div");
		opensource.style.margin = "auto";
		opensource.style.paddingTop = "32px";
		opensource.style.fontWeight = "500";
		opensource.style.textAlign = "left";
		opensource.style.maxWidth = "640px";
		opensource.style.userSelect = "text";
		opensource.textContent = "Pro-test is a free and open-source tool developed and maintained by Andreas Venizelou. The entire source code for this product is accessible to you under the GNU General Public License.";
		center.appendChild(opensource);

		const gpl = document.createElement("div");
		gpl.style.margin = "auto";
		gpl.style.paddingTop = "32px";
		gpl.style.fontWeight = "500";
		gpl.style.textAlign = "left";
		gpl.style.maxWidth = "640px";
		gpl.style.userSelect = "text";
		gpl.textContent = "The GNU General Public License is a type of open-source license that allows users to access, use, copy, modify, and distribute the source code of a product. It also requires that any derivative works (modified versions of the original source code) are also distributed under the same license, and the original author must be acknowledged. This ensures that the source code remains freely available to the public and can be used for any purpose.";
		center.appendChild(gpl);

		center.appendChild(document.createElement("br"));
		center.appendChild(document.createElement("br"));

		const credits = document.createElement("div");
		credits.style.display = "inline-block";
		credits.style.paddingTop = "32px";
		credits.style.maxWidth = "640px";
		credits.style.textAlign = "left";
		credits.style.userSelect = "text";
		credits.innerHTML = "Some of Pro-tests tools use external code and make use of the following libraries:<br>";
		credits.innerHTML += "<b>-</b> MAC addresses lookup table <a target='_blank' href='https://regauth.standards.ieee.org/standards-ra-web/pub/view.html'>by ieee</a><br>";
		credits.innerHTML += "<b>-</b> IP2Location LITE           <a target='_blank' href='https://ip2location.com'>by ip2location.com</a><br>";
		credits.innerHTML += "<b>-</b> IP2Proxy LITE              <a target='_blank' href='https://ip2location.com'>by ip2location.com</a><br>";
		credits.innerHTML += "<b>-</b> Renci.SshNet.SshClient     <a target='_blank' href='https://nuget.org/packages/SSH.NET'>by Renci</a><br>";
		credits.innerHTML += "<b>-</b> Open Sans typeface         <a>by Steve Matteson</a><br>";
		center.appendChild(credits);

		center.appendChild(document.createElement("br"));
		center.appendChild(document.createElement("br"));
		center.appendChild(document.createElement("br"));

		const donate = document.createElement("a");
		donate.style.display = "inline-block";
		donate.style.border = "var(--clr-dark) 1px solid";
		donate.style.borderRadius = "4px";
		donate.style.padding = "2px 4px";
		donate.style.margin = "1px";
		donate.target = "_blank";
		donate.href = "https://paypal.me/veniware";
		donate.textContent = "Make a donation";
		center.appendChild(donate);

		const comma = document.createElement("div");
		comma.style.display = "inline-block";
		comma.style.padding = "1px 4px";
		comma.textContent = ",";
		center.appendChild(comma);

		const sponsor = document.createElement("a");
		sponsor.style.display = "inline-block";
		sponsor.style.border = "var(--clr-dark) 1px solid";
		sponsor.style.borderRadius = "4px";
		sponsor.style.padding = "2px 4px";
		sponsor.style.margin = "1px";
		sponsor.target = "_blank";
		sponsor.href = "https://github.com/sponsors/veniware";
		sponsor.textContent = "become a sponsor";
		center.appendChild(sponsor);

		const _or = document.createElement("div");
		_or.style.display = "inline-block";
		_or.style.padding = "1px 4px";
		_or.textContent = "or";
		center.appendChild(_or);

		const involve = document.createElement("a");
		involve.style.display = "inline-block";
		involve.style.border = "var(--clr-dark) 1px solid";
		involve.style.borderRadius = "4px";
		involve.style.padding = "2px 4px";
		involve.style.margin = "1px";
		involve.target = "_blank";
		involve.href = "https://github.com/openprotest/protest";
		involve.textContent = "get involved";
		center.appendChild(involve);

		center.appendChild(document.createElement("br"));
		center.appendChild(document.createElement("br"));
		center.appendChild(document.createElement("br"));

		const icons = ["mono/logo.svg", "mono/copyleft.svg", "mono/opensource.svg","mono/gpl.svg"];
		for (let i=0; i<icons.length; i++) {
			const newIcon = document.createElement("div");
			newIcon.style.display = "inline-block";
			newIcon.style.width = "52px";
			newIcon.style.height = "52px";
			newIcon.style.margin = "16px";
			newIcon.style.background = `url(${icons[i]})`;
			newIcon.style.backgroundSize = "contain";
			center.appendChild(newIcon);
		}

		logo.onclick = ()=> {
			logo.animate([
				{transform:"translateX(-1px) rotate(0deg)"},
				{transform:"translateX(6px) rotate(2deg)"},
				{transform:"translateX(-8px) rotate(-3deg)"},
				{transform:"translateX(8px) rotate(3deg)"},
				{transform:"translateX(-8px) rotate(-3deg)"},
				{transform:"translateX(8px) rotate(3deg)"},
				{transform:"translateX(-6px) rotate(-2deg)"},
				{transform:"translateX(6px) rotate(2deg)"},
				{transform:"translateX(-2px) rotate(-1deg)"},
				{transform:"translateX(0) rotate(0deg)"}
			], {
				duration:1200, iterations:1
			});
		};
	}

	async ShowUpdate() {
		this.args = "update";
		this.tabsPanel.textContent = "";

		const animationBox = document.createElement("div");
		animationBox.style.backgroundColor = "#202020";
		animationBox.style.width = "144px";
		animationBox.style.height = "144px";
		animationBox.style.borderRadius = "72px";
		animationBox.style.margin = "16px auto";
		this.tabsPanel.appendChild(animationBox);

		const animation = document.createElement("div");
		animation.style.background = "url(mono/update.svg)";
		animation.style.backgroundSize = "contain";
		animation.style.width = "96px";
		animation.style.height = "96px";
		animation.style.filter = "brightness(6)";
		animation.style.position = "absolute";
		animation.style.margin = "24px";
		animation.style.animation = "spin 2s linear infinite";
		animationBox.appendChild(animation);

		const status = document.createElement("div");
		status.textContent = "Checking for updates...";
		status.style.textAlign = "center";
		status.style.fontSize = "large";
		status.style.fontWeight = "600";
		this.tabsPanel.appendChild(status);

		const center = document.createElement("div");
		center.style.textAlign = "center";
		this.tabsPanel.appendChild(center);

		try {
			const response = await fetch("config/checkupdate");
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const json = await response.json();
			if (json.error) throw(json.error);

			animation.style.animation = "none";

			let current = KEEP.version.split(".").map(o=>parseInt(o));

			const updateAvailable = (current[0] < json.major) ||
			(current[0] == json.major && current[1] < json.minor) ||
			(current[0] == json.major && current[1] == json.minor && current[2] < json.build) ||
			(current[0] == json.major && current[1] == json.minor && current[2] == json.build && current[3] < json.revision);

			if (updateAvailable) {
				status.textContent = "A new version is available.";
				center.appendChild(document.createElement("br"));

				const link = document.createElement("a");
				link.style.display = "inline-block";
				link.style.border = "#202020 1px solid";
				link.style.borderRadius = "4px";
				link.style.margin = "4px";
				link.style.padding = "8px";
				link.style.paddingLeft = "36px";
				link.style.background = "url(mono/download.svg) 4px center / 24px 24px no-repeat";
				link.target = "_blank";
				link.href = "https://github.com/openprotest/protest/releases/latest";
				link.textContent = `Pro-test ${json.version}`;
				center.appendChild(link);
			}
			else {
				status.textContent = "Pro-test is up to date.";
			}
		}
		catch (ex) {
			status.textContent = "Failed to fetch the latest version.";
			this.ConfirmBox(ex, true, "mono/error.svg");
		}
		finally {
			animation.style.animation = "none";
		}
	}

	async ShowLegal() {
		this.args = "legal";
		this.tabsPanel.textContent = "";

		const box = document.createElement("div");
		box.style.fontFamily = "monospace";
		box.style.userSelect = "text";
		box.style.whiteSpace = "pre-wrap";
		this.tabsPanel.appendChild(box);

		await fetch("license.txt")
		.then(response=> response.text())
		.then(text=>{
			if (text.length === 0) return;
			box.textContent = text;
		});
	}

	async ShowUpdateModules() {
		this.args = "updatemod";
		this.tabsPanel.textContent = "";

		const location    = this.CreateDropArea("Drop a file here to update IP-location knowledge base", "/config/upload/iplocation", ["csv"]);
		const proxy       = this.CreateDropArea("Drop a file here to update proxy servers knowledge base", "/config/upload/proxy", ["csv"]);
		const macResolver = this.CreateDropArea("Drop a file here to update MAC address-vendors knowledge base", "/config/upload/macresolve", ["csv"]);
		const macTor      = this.CreateDropArea("Drop a file here to update TOR servers knowledge base", "/config/upload/tor", ["txt"]);

		this.tabsPanel.append(location, proxy, macResolver, macTor);

		const resources = document.createElement("div");
		resources.style.paddingTop = "100px";
		this.tabsPanel.appendChild(resources);

		const resourcesText = document.createElement("div");
		resourcesText.textContent = "Revised files for the knowledge base may be available on the following links:";

		const link1 = document.createElement("a");
		link1.style.display = "block";
		link1.style.margin = "8px";
		link1.target = "_blank";
		link1.href = "https://lite.ip2location.com/database/db5-ip-country-region-city-latitude-longitude";
		link1.textContent = "IP2Location - Location list";
		resources.append(link1);

		const link2 = document.createElement("a");
		link2.style.display = "block";
		link2.style.margin = "8px";
		link2.target = "_blank";
		link2.href = "https://lite.ip2location.com/database/px1-ip-country";
		link2.textContent = "IP2Location - Proxy list";
		resources.append(link2);

		const link3 = document.createElement("a");
		link3.style.display = "block";
		link3.style.margin = "8px";
		link3.target = "_blank";
		link3.href = "https://regauth.standards.ieee.org/standards-ra-web/pub/view.html";
		link3.textContent = "IEEE - MAC address block";
		resources.append(link3);

		resources.append(resourcesText, link1, link2, link3);
	}

	CreateDropArea(text, uploadUrl, filter) {
		const dropArea = document.createElement("div");
		dropArea.style.minHeight    = "20px";
		dropArea.style.margin       = "16px";
		dropArea.style.padding      = "20px";
		dropArea.style.border       = "2px dashed var(--clr-dark)";
		dropArea.style.borderRadius = "8px";
		dropArea.style.transition   = ".4s";

		const message = document.createElement("div");
		message.textContent = text;
		message.style.color = "var(--clr-dark)";
		message.style.fontWeight = "600";
		message.style.textAlign = "center";
		dropArea.append(message);

		let isBusy = false;

		dropArea.ondragover = ()=> {
			if (isBusy) return;
			dropArea.style.backgroundColor = "var(--clr-control)";
			dropArea.style.border = "2px solid var(--clr-dark)";
			return false;
		};
		dropArea.ondragleave = ()=> {
			if (isBusy) return;
			dropArea.style.backgroundColor = "";
			dropArea.style.border = "2px dashed var(--clr-dark)";
		};
		dropArea.ondrop = async event=> {
			event.preventDefault();

			if (isBusy) return;

			dropArea.style.backgroundColor = "";
			dropArea.style.border = "2px dashed var(--clr-dark)";

			if (event.dataTransfer.files.length !== 1) {
				this.ConfirmBox("Please upload a single file.", true);
				return;
			}

			let file = event.dataTransfer.files[0];
			let extension = file.name.split(".");
			extension = extension[extension.length-1].toLowerCase();

			if (!filter.includes(extension)) {
				this.ConfirmBox("Unsupported file", true);
				return;
			}

			const formData = new FormData();
			formData.append('file', file);

			isBusy = true;
			message.textContent = "Uploading file... This might take a minute.";
			dropArea.style.border = "2px solid var(--clr-dark)";

			const spinner = document.createElement("div");
			spinner.className = "spinner";
			spinner.style.textAlign = "left";
			spinner.style.marginTop = "32px";
			spinner.style.marginBottom = "16px";
			spinner.appendChild(document.createElement("div"));
			dropArea.appendChild(spinner);

			try {
				const response = await fetch(uploadUrl, {
					method: "POST",
					body: formData
				});

				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const json = await response.json();
				if (json.error) throw (json.error);
			}
			catch (ex) {
				this.ConfirmBox(ex, true, "mono/error.svg");
			}
			finally {
				isBusy = false;
				message.textContent = text;
				dropArea.style.border = "2px dashed var(--clr-dark)";
				dropArea.removeChild(spinner);
			}

			/*let fileReader = new FileReader();
			fileReader.onload = ()=> {
				let fileUrl = fileReader.result;
			};
			fileReader.readAsDataURL(file);*/
		};

		return dropArea;
	}
}