class Personalize extends Tabs {
	constructor(args) {
		super(null);

		this.args = args ?? "";

		this.SetTitle("Personalize");
		this.SetIcon("mono/personalize.svg");

		this.tabsPanel.style.padding = "24px";
		this.tabsPanel.style.overflowY = "auto";

		this.guiTab     = this.AddTab("Appearance", "mono/tv.svg");
		this.regionTab  = this.AddTab("Regional format", "mono/earth.svg" );
		this.sessionTab = this.AddTab("Session", "mono/hourglass.svg");
		this.chatTab    = this.AddTab("Chat", "mono/chat.svg");
		this.agentTab   = this.AddTab("Agent", "mono/agent.svg");

		this.guiTab.onclick     = ()=> this.ShowGui();
		this.regionTab.onclick  = ()=> this.ShowRegion();
		this.sessionTab.onclick = ()=> this.ShowSession();
		this.chatTab.onclick    = ()=> this.ShowChat();
		this.agentTab.onclick   = ()=> this.ShowAgent();

		switch (this.args) {
		case "region":
			this.regionTab.className = "v-tab-selected";
			this.ShowRegion();
			break;

		case "session":
			this.sessionTab.className = "v-tab-selected";
			this.ShowSession();
			break;

		case "chat":
			this.chatTab.className = "v-tab-selected";
			this.ShowChat();
			break;

		case "agent":
			this.agentTab.className = "v-tab-selected";
			this.ShowAgent();
			break;

		default:
			this.guiTab.className = "v-tab-selected";
			this.ShowGui();
		}
	}

	ShowGui() {
		this.args = "appearance";
		this.tabsPanel.textContent = "";

		this.winMaxedCheckbox = this.CreateToggle("Always maximize windows", false, this.tabsPanel).checkbox;
		this.tabsPanel.appendChild(document.createElement("br"));
		this.tabsPanel.appendChild(document.createElement("br"));

		this.popOutCheckbox = this.CreateToggle("Pop-out button on windows", false, this.tabsPanel).checkbox;
		this.tabsPanel.appendChild(document.createElement("br"));
		this.tabsPanel.appendChild(document.createElement("br"));

		this.taskTooltipCheckbox = this.CreateToggle("Tooltip on taskbar icons", false, this.tabsPanel).checkbox;
		this.tabsPanel.appendChild(document.createElement("br"));
		this.tabsPanel.appendChild(document.createElement("br"));

		this.windowShadowsCheckbox = this.CreateToggle("Shadow under windows", false, this.tabsPanel).checkbox;
		this.tabsPanel.appendChild(document.createElement("br"));
		this.tabsPanel.appendChild(document.createElement("br"));

		this.dateTimeCheckbox = this.CreateToggle("Date and time", false, this.tabsPanel).checkbox;
		this.tabsPanel.appendChild(document.createElement("br"));
		this.tabsPanel.appendChild(document.createElement("br"));

		this.animationsCheckbox = this.CreateToggle("Animations", false, this.tabsPanel).checkbox;
		this.tabsPanel.appendChild(document.createElement("br"));
		this.tabsPanel.appendChild(document.createElement("br"));

		this.glassCheckbox = this.CreateToggle("Glass effect", false, this.tabsPanel).checkbox;
		this.tabsPanel.appendChild(document.createElement("br"));
		this.tabsPanel.appendChild(document.createElement("br"));

		const scrollBarLabel = document.createElement("div");
		scrollBarLabel.textContent = "Scroll bar style:";
		scrollBarLabel.style.display = "inline-block";
		scrollBarLabel.style.minWidth = "150px";
		scrollBarLabel.style.fontWeight = "600";
		this.tabsPanel.appendChild(scrollBarLabel);

		this.scrollBarInput = document.createElement("select");
		this.scrollBarInput.style.width = "200px";
		this.tabsPanel.appendChild(this.scrollBarInput);
		this.tabsPanel.appendChild(document.createElement("br"));
		this.tabsPanel.appendChild(document.createElement("br"));

		const scrollBarOptions = ["Default", "Thin", "Hidden"];
		for (let i=0; i<scrollBarOptions.length; i++) {
			const option = document.createElement("option");
			option.value = scrollBarOptions[i].toLowerCase();
			option.textContent = scrollBarOptions[i] === "default" ? "System default" : scrollBarOptions[i];
			this.scrollBarInput.appendChild(option);
		}

		const taskbarPositionLabel = document.createElement("div");
		taskbarPositionLabel.textContent = "Taskbar position:";
		taskbarPositionLabel.style.display = "inline-block";
		taskbarPositionLabel.style.minWidth = "150px";
		taskbarPositionLabel.style.fontWeight = "600";
		this.tabsPanel.appendChild(taskbarPositionLabel);

		this.taskbarPositionInput = document.createElement("select");
		this.taskbarPositionInput.style.width = "200px";
		this.tabsPanel.appendChild(this.taskbarPositionInput);
		this.tabsPanel.appendChild(document.createElement("br"));
		this.tabsPanel.appendChild(document.createElement("br"));

		const taskbarPositionOptions = ["Top", "Bottom", "Left", "Right"];
		for (let i=0; i<taskbarPositionOptions.length; i++) {
			const option = document.createElement("option");
			option.value = taskbarPositionOptions[i].toLowerCase();
			option.textContent = taskbarPositionOptions[i];
			this.taskbarPositionInput.appendChild(option);
		}

		this.tabsPanel.appendChild(document.createElement("hr"));
		this.tabsPanel.appendChild(document.createElement("br"));

		const accentColorLabel = document.createElement("div");
		accentColorLabel.textContent = "Accent color:";
		accentColorLabel.style.fontWeight = "600";
		accentColorLabel.style.paddingBottom = "8px";
		this.tabsPanel.appendChild(accentColorLabel);

		this.accentBoxes = document.createElement("div");
		this.tabsPanel.appendChild(this.accentBoxes);

		this.tabsPanel.appendChild(document.createElement("br"));

		const saturationLabel = document.createElement("div");
		saturationLabel.textContent = "Saturation:";
		saturationLabel.style.display = "inline-block";
		saturationLabel.style.minWidth = "120px";
		saturationLabel.style.fontWeight = "600";
		this.tabsPanel.appendChild(saturationLabel);

		this.saturation = document.createElement("input");
		this.saturation.setAttribute("aria-label", "Accent color saturation");
		this.saturation.type = "range";
		this.saturation.min = "75";
		this.saturation.max = "125";
		this.saturation.style.width = "200px";
		this.tabsPanel.appendChild(this.saturation);

		this.saturationValueLabel = document.createElement("div");
		this.saturationValueLabel.style.paddingLeft = "8px";
		this.saturationValueLabel.style.display = "inline-block";
		this.tabsPanel.appendChild(this.saturationValueLabel);

		this.winMaxedCheckbox.checked      = localStorage.getItem("w_always_maxed") === "true";
		this.popOutCheckbox.checked        = localStorage.getItem("w_popout") === "true";
		this.taskTooltipCheckbox.checked   = localStorage.getItem("w_tasktooltip") !== "false";
		this.windowShadowsCheckbox.checked = localStorage.getItem("w_dropshadow") !== "false";
		this.dateTimeCheckbox.checked      = localStorage.getItem("desk_datetime") !== "false";
		this.animationsCheckbox.checked    = localStorage.getItem("animations") !== "false";
		this.glassCheckbox.checked         = localStorage.getItem("glass") === "true";
		this.scrollBarInput.value          = localStorage.getItem("scrollbar_style") ? localStorage.getItem("scrollbar_style") : "thin";
		this.taskbarPositionInput.value    = localStorage.getItem("taskbar_position") ? localStorage.getItem("taskbar_position") : "bottom";

		this.saturation.value = localStorage.getItem("accent_saturation") ? localStorage.getItem("accent_saturation") : 100;

		this.tabsPanel.appendChild(document.createElement("br"));

		this.accentIndicators = [];
		let selected_accent = [255,102,0];
		if (localStorage.getItem("accent_color"))
			selected_accent = JSON.parse(localStorage.getItem("accent_color"));

		const accentColors = [[224,72,64], [255,102,0], [255,186,0], [96,192,32], [36,176,244]];

		for (let i = 0; i < accentColors.length; i++) {
			let hsl = UI.RgbToHsl(accentColors[i]); //--clr-accent
			let step1 = `hsl(${hsl[0]-4},${hsl[1]*this.saturation.value/100}%,${hsl[2]*.78}%)`;
			let step2 = `hsl(${hsl[0]+7},${hsl[1]*this.saturation.value/100}%,${hsl[2]*.9}%)`; //--clr-select
			let step3 = `hsl(${hsl[0]-4},${hsl[1]*this.saturation.value/100}%,${hsl[2]*.8}%)`;
			let gradient = `linear-gradient(to bottom, ${step1}0%, ${step2}92%, ${step3}100%)`;

			const themeBox = document.createElement("div");
			themeBox.style.display = "inline-block";
			themeBox.style.margin = "2px 4px";
			this.accentBoxes.appendChild(themeBox);

			const gradientBox = document.createElement("div");
			gradientBox.style.width = "48px";
			gradientBox.style.height = "48px";
			gradientBox.style.borderRadius = "4px";
			gradientBox.style.background = gradient;
			gradientBox.style.border = `${step1} 1px solid`;
			themeBox.appendChild(gradientBox);

			let isSelected = selected_accent[0] == accentColors[i][0] && selected_accent[1] == accentColors[i][1] && selected_accent[2] == accentColors[i][2];

			const indicator = document.createElement("div");
			indicator.style.width = isSelected ? "48px" : "8px";
			indicator.style.height = "8px";
			indicator.style.borderRadius = "8px";
			indicator.style.marginTop = "4px";
			indicator.style.marginLeft = isSelected ? "0" : "20px";
			indicator.style.backgroundColor = `hsl(${hsl[0]},${hsl[1]*this.saturation.value/100}%,${hsl[2]}%)`;
			indicator.style.border = `${step1} 1px solid`;
			indicator.style.transition = "margin .4s, width .4s";
			themeBox.appendChild(indicator);

			this.accentIndicators.push(indicator);

			themeBox.onclick = ()=> {
				localStorage.setItem("accent_color", JSON.stringify(accentColors[i]));
				Apply();

				for (let j = 0; j < WIN.array.length; j++) { //update other setting windows
					if (WIN.array[j] instanceof Personalize && WIN.array[j].args === "appearance") {
						for (let k = 0; k < this.accentIndicators.length; k++) {
							if (k === i) continue;
							WIN.array[j].accentIndicators[k].style.width = "8px";
							WIN.array[j].accentIndicators[k].style.marginLeft = "20px";
						}
						WIN.array[j].accentIndicators[i].style.width = "48px";
						WIN.array[j].accentIndicators[i].style.marginLeft = "0px";
					}
				}
			};
		}

		/*this.tabsPanel.appendChild(document.createElement("br"));
		this.tabsPanel.appendChild(document.createElement("hr"));
		this.tabsPanel.appendChild(document.createElement("br"));

		const wallpaperLabel = document.createElement("div");
		wallpaperLabel.textContent = "Wallpaper:";
		wallpaperLabel.style.fontWeight = "600";
		this.tabsPanel.appendChild(wallpaperLabel);

		const wallpaperDropArea = document.createElement("div");
		wallpaperDropArea.style.maxWidth     = "400px";
		wallpaperDropArea.style.minHeight    = "20px";
		wallpaperDropArea.style.margin       = "16px";
		wallpaperDropArea.style.padding      = "20px";
		wallpaperDropArea.style.border       = "2px dashed var(--clr-dark)";
		wallpaperDropArea.style.borderRadius = "8px";
		wallpaperDropArea.style.transition   = ".4s";
		this.tabsPanel.appendChild(wallpaperDropArea);

		const wallpaperDropLabel = document.createElement("div");
		wallpaperDropLabel.textContent = "Drop a picture file here to set as wallpaper";
		wallpaperDropLabel.style.color = "var(--clr-dark)";
		wallpaperDropLabel.style.fontWeight = "600";
		wallpaperDropLabel.style.textAlign = "center";
		wallpaperDropArea.append(wallpaperDropLabel);

		wallpaperDropArea.ondragover = ()=> {
			wallpaperDropArea.style.backgroundColor = "var(--clr-control)";
			wallpaperDropArea.style.border = "2px solid var(--clr-dark)";
			return false;
		};

		wallpaperDropArea.ondragleave = ()=> {
			wallpaperDropArea.style.backgroundColor = "";
			wallpaperDropArea.style.border = "2px dashed var(--clr-dark)";
		};

		wallpaperDropArea.ondrop = event=>{
			event.preventDefault();
			wallpaperDropArea.style.backgroundColor = "";
			wallpaperDropArea.style.border = "2px dashed var(--clr-dark)";

			if (event.dataTransfer.files.length !== 1) { return; }

			const reader = new FileReader();
			reader.onload = () => {
				const base64Url = reader.result;
				container.style.backgroundImage = `url(${base64Url})`;
				container.style.backgroundSize = "cover";
				container.style.backgroundPosition = "center";
			};

			reader.readAsDataURL(event.dataTransfer.files[0]);
		};*/

		const Apply = ()=> {
			WIN.alwaysMaxed = this.winMaxedCheckbox.checked;
			taskbar.className = this.taskTooltipCheckbox.checked ? "" : "no-tooltip";

			container.className = "";
			if (!this.popOutCheckbox.checked)        container.classList.add("no-popout");
			if (!this.windowShadowsCheckbox.checked) container.classList.add("disable-window-dropshadows");
			if (this.glassCheckbox.checked)          container.classList.add("glass");

			analog_clock.style.visibility = date_calendar.style.visibility = this.dateTimeCheckbox.checked ? "visible" : "hidden";
			analog_clock.style.opacity = date_calendar.style.opacity = this.dateTimeCheckbox.checked ? "1" : "0";

			container.classList.add(`scrollbar-${this.scrollBarInput.value}`);

			UI.SetTaskbarPosition(this.taskbarPositionInput.value);

			document.body.className = this.animationsCheckbox.checked ? "" : "disable-animations";

			localStorage.setItem("w_always_maxed", this.winMaxedCheckbox.checked);
			localStorage.setItem("w_popout", this.popOutCheckbox.checked);
			localStorage.setItem("w_tasktooltip", this.taskTooltipCheckbox.checked);
			localStorage.setItem("w_dropshadow", this.windowShadowsCheckbox.checked);
			localStorage.setItem("desk_datetime", this.dateTimeCheckbox.checked);
			localStorage.setItem("animations", this.animationsCheckbox.checked);
			localStorage.setItem("glass", this.glassCheckbox.checked);
			localStorage.setItem("scrollbar_style", this.scrollBarInput.value);
			localStorage.setItem("taskbar_position", this.taskbarPositionInput.value);

			localStorage.setItem("accent_saturation", this.saturation.value);

			for (let i = 0; i < WIN.array.length; i++) { //update other setting windows
				if (WIN.array[i] instanceof Personalize && WIN.array[i].args === "appearance") {
					if (WIN.array[i] !== this) {
						WIN.array[i].winMaxedCheckbox.checked      = this.winMaxedCheckbox.checked;
						WIN.array[i].popOutCheckbox.checked        = this.popOutCheckbox.checked;
						WIN.array[i].taskTooltipCheckbox.checked   = this.taskTooltipCheckbox.checked;
						WIN.array[i].windowShadowsCheckbox.checked = this.windowShadowsCheckbox.checked;
						WIN.array[i].dateTimeCheckbox.checked      = this.dateTimeCheckbox.checked;
						WIN.array[i].animationsCheckbox.checked    = this.animationsCheckbox.checked;
						WIN.array[i].glassCheckbox.checked         = this.glassCheckbox.checked;
						WIN.array[i].scrollBarInput.value          = this.scrollBarInput.value;
						WIN.array[i].taskbarPositionInput.value    = this.taskbarPositionInput.value;

						WIN.array[i].saturation.value = this.saturation.value;
						WIN.array[i].saturationValueLabel.textContent = `${this.saturation.value}%`;
					}

					let saturation = this.saturation.value / 100;
					for (let j = 0; j < this.accentBoxes.childNodes.length; j++) {
						let hsl = UI.RgbToHsl(accentColors[j]);
						let step1 = `hsl(${hsl[0]-4},${hsl[1]*saturation}%,${hsl[2]*.78}%)`;
						let step2 = `hsl(${hsl[0]+7},${hsl[1]*saturation}%,${hsl[2]*.9}%)`; //--clr-select
						let step3 = `hsl(${hsl[0]-4},${hsl[1]*saturation}%,${hsl[2]*.8}%)`;
						let gradient = `linear-gradient(to bottom, ${step1}0%, ${step2}92%, ${step3}100%)`;

						WIN.array[i].accentBoxes.childNodes[j].firstChild.style.background = gradient;
						WIN.array[i].accentBoxes.childNodes[j].lastChild.style.backgroundColor = `hsl(${hsl[0]},${hsl[1]*saturation}%,${hsl[2]}%)`;
						WIN.array[i].accentBoxes.childNodes[j].firstChild.style.border = `${step1} 1px solid`;
						WIN.array[i].accentBoxes.childNodes[j].lastChild.style.border = `${step1} 1px solid`;
					}
				}

				if (WIN.array[i].popOutWindow) {
					let accent = JSON.parse(localStorage.getItem("accent_color"));
					let hsl = UI.RgbToHsl(accent);
					WIN.array[i].popOutWindow.document.querySelector(":root").style.setProperty("--clr-select", `hsl(${hsl[0]+7},${hsl[1]*this.saturation.value/100}%,${hsl[2]*.9}%)`);
					WIN.array[i].popOutWindow.document.querySelector(":root").style.setProperty("--clr-accent", `hsl(${hsl[0]},${hsl[1]*this.saturation.value/100}%,${hsl[2]}%)`);
				}
			}

			this.saturationValueLabel.textContent = `${this.saturation.value}%`;

			let accentColor = localStorage.getItem("accent_color") ? JSON.parse(localStorage.getItem("accent_color")) : [255,102,0];

			localStorage.setItem("accent_saturation", this.saturation.value);
			UI.SetAccentColor(accentColor, this.saturation.value / 100);
		};

		this.winMaxedCheckbox.onchange      = Apply;
		this.popOutCheckbox.onchange        = Apply;
		this.taskTooltipCheckbox.onchange   = Apply;
		this.windowShadowsCheckbox.onchange = Apply;
		this.dateTimeCheckbox.onchange      = Apply;
		this.animationsCheckbox.onchange    = Apply;
		this.glassCheckbox.onchange         = Apply;
		this.saturation.oninput             = Apply;
		this.scrollBarInput.onchange        = Apply;
		this.taskbarPositionInput.onchange  = Apply;

		Apply();
	}

	ShowRegion() {
		this.args = "region";
		this.tabsPanel.textContent = "";

		const regionLabel = document.createElement("div");
		regionLabel.textContent = "Region:";
		regionLabel.style.display = "inline-block";
		regionLabel.style.minWidth = "100px";
		regionLabel.style.fontWeight = "600";
		this.tabsPanel.appendChild(regionLabel);

		this.region = document.createElement("select");
		this.region.style.width = "220px";
		this.tabsPanel.appendChild(this.region);

		const countries = [
			{ name: "System format", code: "sys" },
			{ name: "Arabic - Saudi Arabia", code: "ar-SA" },
			{ name: "Bengali - Bangladesh", code: "bn-BD" },
			{ name: "Bengali - India", code: "bn-IN" },
			{ name: "Czech - Czech Republic", code: "cs-CZ" },
			{ name: "Danish - Denmark", code: "da-DK" },
			{ name: "German - Austria", code: "de-AT" },
			{ name: "German - Switzerland", code: "de-CH" },
			{ name: "German - Germany", code: "de-DE" },
			{ name: "Greek - Greece", code: "el-GR" },
			{ name: "English - Australia", code: "en-AU" },
			{ name: "English - Canada", code: "en-CA" },
			{ name: "English - United Kingdom", code: "en-GB" },
			{ name: "English - Ireland", code: "en-IE" },
			{ name: "English - India", code: "en-IN" },
			{ name: "English - New Zealand", code: "en-NZ" },
			{ name: "English - United States", code: "en-US" },
			{ name: "English - South Africa", code: "en-ZA" },
			{ name: "Spanish - Argentina", code: "es-AR" },
			{ name: "Spanish - Chile", code: "es-CL" },
			{ name: "Spanish - Colombia", code: "es-CO" },
			{ name: "Spanish - Spain", code: "es-ES" },
			{ name: "Spanish - Mexico", code: "es-MX" },
			{ name: "Spanish - United States", code: "es-US" },
			{ name: "Finnish - Finland", code: "fi-FI" },
			{ name: "French - Belgium", code: "fr-BE" },
			{ name: "French - Canada", code: "fr-CA" },
			{ name: "French - Switzerland", code: "fr-CH" },
			{ name: "French - France", code: "fr-FR" },
			{ name: "Hebrew - Israel", code: "he-IL" },
			{ name: "Hindi - India", code: "hi-IN" },
			{ name: "Hungarian - Hungary", code: "hu-HU" },
			{ name: "Indonesian - Indonesia", code: "id-ID" },
			{ name: "Italian - Switzerland", code: "it-CH" },
			{ name: "Italian - Italy", code: "it-IT" },
			{ name: "Japanese - Japan", code: "ja-JP" },
			{ name: "Korean - South Korea", code: "ko-KR" },
			{ name: "Dutch - Belgium", code: "nl-BE" },
			{ name: "Dutch - Netherlands", code: "nl-NL" },
			{ name: "Norwegian - Norway", code: "no-NO" },
			{ name: "Polish - Poland", code: "pl-PL" },
			{ name: "Portuguese - Brazil", code: "pt-BR" },
			{ name: "Portuguese - Portugal", code: "pt-PT" },
			{ name: "Romanian - Romania", code: "ro-RO" },
			{ name: "Russian - Russia", code: "ru-RU" },
			{ name: "Slovak - Slovakia", code: "sk-SK" },
			{ name: "Swedish - Sweden", code: "sv-SE" },
			{ name: "Tamil - India", code: "ta-IN" },
			{ name: "Tamil - Sri Lanka", code: "ta-LK" },
			{ name: "Thai - Thailand", code: "th-TH" },
			{ name: "Turkish - Turkey", code: "tr-TR" },
			{ name: "Chinese - China", code: "zh-CN" },
			{ name: "Chinese - Hong Kong", code: "zh-HK" },
			{ name: "Chinese - Taiwan", code: "zh-TW" }
		];

		for (let i = 0; i < countries.length; i++) {
			const option = document.createElement("option");
			option.value = countries[i].code;
			option.textContent = countries[i].name;
			this.region.appendChild(option);
		}

		this.tabsPanel.appendChild(document.createElement("br"));
		this.tabsPanel.appendChild(document.createElement("br"));

		this.region_date = document.createElement("div");
		this.region_date.style.marginBottom = "8px";
		this.tabsPanel.appendChild(this.region_date);

		this.region_time = document.createElement("div");
		this.region_time.style.marginBottom = "8px";
		this.tabsPanel.appendChild(this.region_time);

		this.region_number = document.createElement("div");
		this.tabsPanel.appendChild(this.region_number);

		this.region.value = localStorage.getItem("regional_format");

		const Apply = ()=> {
			UI.regionalFormat = this.region.value.length > 0 ? this.region.value : "sys";
			localStorage.setItem("regional_format", this.region.value);

			const now = new Date();
			date_month.textContent = now.toLocaleDateString(UI.regionalFormat, {month:"short"}).toUpperCase();
			date_date.textContent = now.getDate();
			date_day.textContent = now.toLocaleDateString(UI.regionalFormat, {weekday:"long"});

			for (let i = 0; i < WIN.array.length; i++) //update other setting windows
				if (WIN.array[i] instanceof Personalize && WIN.array[i].args === "region") {
					WIN.array[i].region.value = UI.regionalFormat;

					WIN.array[i].region_date.textContent = "Date: " + now.toLocaleDateString(UI.regionalFormat, {});
					WIN.array[i].region_time.textContent = "Time: " + now.toLocaleTimeString(UI.regionalFormat, {});

					let num = 1_234_567_890.321;
					WIN.array[i].region_number.textContent = "Number: " + num.toLocaleString(UI.regionalFormat);
				}
		};

		this.region.onchange = ()=>{
			Apply();
		};

		Apply();
	}

	ShowSession() {
		this.args = "session";
		this.tabsPanel.textContent = "";

		this.restoreSessionToggle = this.CreateToggle("Re-open previous windows on page load", false, this.tabsPanel);
		this.restoreSessionToggle.label.style.fontWeight = "600";

		this.tabsPanel.appendChild(document.createElement("br"));
		this.tabsPanel.appendChild(document.createElement("br"));
		this.tabsPanel.appendChild(document.createElement("hr"));
		this.tabsPanel.appendChild(document.createElement("br"));

		this.aliveOnCloseToggle = this.CreateToggle("Keep session alive when browser is closed", false, this.tabsPanel);
		this.aliveOnCloseToggle.label.style.fontWeight = "600";

		this.tabsPanel.appendChild(document.createElement("br"));
		this.tabsPanel.appendChild(document.createElement("br"));

		const sessionTimeoutLabel = document.createElement("div");
		sessionTimeoutLabel.textContent = "Logout if inactive for: ";
		sessionTimeoutLabel.style.display = "inline-block";
		sessionTimeoutLabel.style.minWidth = "200px";
		sessionTimeoutLabel.style.fontWeight = "600";
		this.tabsPanel.appendChild(sessionTimeoutLabel);

		this.sessionTimeout = document.createElement("input");
		this.sessionTimeout.setAttribute("aria-label", "Logout when inactive");
		this.sessionTimeout.type = "range";
		this.sessionTimeout.min = "1";
		this.sessionTimeout.max = "8";
		this.sessionTimeout.style.width = "200px";
		this.tabsPanel.appendChild(this.sessionTimeout);

		this.sessionTimeoutValueLabel = document.createElement("div");
		this.sessionTimeoutValueLabel.textContent = "15 min.";
		this.sessionTimeoutValueLabel.style.paddingLeft = "8px";
		this.sessionTimeoutValueLabel.style.display = "inline-block";
		this.tabsPanel.appendChild(this.sessionTimeoutValueLabel);

		this.tabsPanel.appendChild(document.createElement("br"));
		this.tabsPanel.appendChild(document.createElement("br"));

		const cookieLifeLabel = document.createElement("div");
		cookieLifeLabel.textContent = "Cookie lifetime: ";
		cookieLifeLabel.style.display = "inline-block";
		cookieLifeLabel.style.minWidth = "200px";
		cookieLifeLabel.style.fontWeight = "600";
		this.tabsPanel.appendChild(cookieLifeLabel);

		this.cookieLife = document.createElement("input");
		this.cookieLife.setAttribute("aria-label", "Cookie lifetime");
		this.cookieLife.type = "range";
		this.cookieLife.min = "1";
		this.cookieLife.max = "12";
		this.cookieLife.style.width = "200px";
		this.tabsPanel.appendChild(this.cookieLife);

		this.cookieLifeValueLabel = document.createElement("div");
		this.cookieLifeValueLabel.textContent = "15 min.";
		this.cookieLifeValueLabel.style.paddingLeft = "8px";
		this.cookieLifeValueLabel.style.display = "inline-block";
		this.tabsPanel.appendChild(this.cookieLifeValueLabel);


		this.tabsPanel.appendChild(document.createElement("br"));
		this.tabsPanel.appendChild(document.createElement("br"));
		this.tabsPanel.appendChild(document.createElement("hr"));
		this.tabsPanel.appendChild(document.createElement("br"));

		const clearLocalCacheButton = document.createElement("input");
		clearLocalCacheButton.type = "button";
		clearLocalCacheButton.value = "Clear local storage";
		clearLocalCacheButton.style.height = "36px";
		clearLocalCacheButton.style.padding = "8px 16px";
		this.tabsPanel.appendChild(clearLocalCacheButton);

		this.restoreSessionToggle.checkbox.checked = localStorage.getItem("restore_session") === "true";
		this.aliveOnCloseToggle.checkbox.checked = localStorage.getItem("alive_after_close") === "true";
		this.sessionTimeout.value = localStorage.getItem("session_timeout") == null ? 1 : parseInt(localStorage.getItem("session_timeout"));
		this.cookieLife.value = localStorage.getItem("cookie_lifetime") == null ? 5 : parseInt(localStorage.getItem("cookie_lifetime"));


		clearLocalCacheButton.onclick = ()=> this.ClearCache();

		const timeMapping = { 1:15, 2:30, 3:60, 4:2*60, 5:4*60, 6:8*60, 7:24*60, 8:Infinity };
		const Apply = ()=> {
			localStorage.setItem("restore_session", this.restoreSessionToggle.checkbox.checked);
			localStorage.setItem("alive_after_close", this.aliveOnCloseToggle.checkbox.checked);
			localStorage.setItem("session_timeout", this.sessionTimeout.value);
			localStorage.setItem("cookie_lifetime", this.cookieLife.value);

			for (let i = 0; i < WIN.array.length; i++) //update other setting windows
				if (WIN.array[i] instanceof Personalize && WIN.array[i].args === "session") {
					WIN.array[i].restoreSessionToggle.checkbox.checked = this.restoreSessionToggle.checkbox.checked;
					WIN.array[i].aliveOnCloseToggle.checkbox.checked   = this.aliveOnCloseToggle.checkbox.checked;
					WIN.array[i].sessionTimeout.value      = this.sessionTimeout.value;
					WIN.array[i].cookieLife.value          = this.cookieLife.value;

					if (timeMapping[this.sessionTimeout.value] == Infinity) {
						WIN.array[i].sessionTimeoutValueLabel.textContent = timeMapping[this.sessionTimeout.value];
					}
					else {
						let value = timeMapping[this.sessionTimeout.value];
						WIN.array[i].sessionTimeoutValueLabel.textContent = value > 60 ? value / 60 + " hours" : value + " minutes";
					}

					if (KEEP.sessionTtlMapping[this.cookieLife.value] < 8) {
						WIN.array[i].cookieLifeValueLabel.textContent = KEEP.sessionTtlMapping[this.cookieLife.value] == 1 ? "1 day" : KEEP.sessionTtlMapping[this.cookieLife.value] + " days";
					}
					else if (KEEP.sessionTtlMapping[this.cookieLife.value] < 29) {
						WIN.array[i].cookieLifeValueLabel.textContent = KEEP.sessionTtlMapping[this.cookieLife.value] == 7 ? "1 week" : KEEP.sessionTtlMapping[this.cookieLife.value] / 7 + " weeks";
					}
					else {
						WIN.array[i].cookieLifeValueLabel.textContent = KEEP.sessionTtlMapping[this.cookieLife.value] == 30 ? "1 month" : KEEP.sessionTtlMapping[this.cookieLife.value] / 30 + " months";
					}
				}
		};

		this.restoreSessionToggle.checkbox.onchange = Apply;
		this.aliveOnCloseToggle.checkbox.onchange = Apply;
		this.sessionTimeout.oninput = Apply;

		this.cookieLife.oninput = ()=> {
			try {
				KEEP.socket.send(JSON.stringify({
					type : "update-session-ttl",
					ttl: KEEP.sessionTtlMapping[this.cookieLife.value]
				}));

				Apply();
			}
			catch { }
		};

		Apply();
	}

	ShowChat() {
		this.args = "chat";
		this.tabsPanel.textContent = "";

		this.openChatWindowOnMessageCheckbox = document.createElement("input");
		this.openChatWindowOnMessageCheckbox.type = "checkbox";
		this.tabsPanel.appendChild(this.openChatWindowOnMessageCheckbox);
		this.AddCheckBoxLabel(this.tabsPanel, this.openChatWindowOnMessageCheckbox, "Focus chat window when receiving a message").style.fontWeight = "600";

		this.tabsPanel.appendChild(document.createElement("br"));
		this.tabsPanel.appendChild(document.createElement("br"));
		this.tabsPanel.appendChild(document.createElement("hr"));
		this.tabsPanel.appendChild(document.createElement("br"));

		this.enableNotificationSoundCheckbox = document.createElement("input");
		this.enableNotificationSoundCheckbox.type = "checkbox";
		this.tabsPanel.appendChild(this.enableNotificationSoundCheckbox);
		this.AddCheckBoxLabel(this.tabsPanel, this.enableNotificationSoundCheckbox, "Play notification sound").style.fontWeight = "600";

		this.tabsPanel.appendChild(document.createElement("br"));
		this.tabsPanel.appendChild(document.createElement("br"));

		const volumeLabel = document.createElement("div");
		volumeLabel.textContent = "Volume: ";
		volumeLabel.style.display = "inline-block";
		volumeLabel.style.minWidth = "100px";
		volumeLabel.style.fontWeight = "600";
		this.tabsPanel.appendChild(volumeLabel);

		this.notificationVolume = document.createElement("input");
		this.notificationVolume.setAttribute("aria-label", "Chat notification volume");
		this.notificationVolume.type = "range";
		this.notificationVolume.min = 0;
		this.notificationVolume.max = 100;
		this.notificationVolume.style.width = "200px";
		this.tabsPanel.appendChild(this.notificationVolume);

		this.notificationVolumeValue = document.createElement("div");
		this.notificationVolumeValue.textContent = "100%";
		this.notificationVolumeValue.style.paddingLeft = "8px";
		this.notificationVolumeValue.style.display = "inline-block";
		this.tabsPanel.appendChild(this.notificationVolumeValue);

		this.tabsPanel.appendChild(document.createElement("br"));
		this.tabsPanel.appendChild(document.createElement("br"));

		const playButton = document.createElement("input");
		playButton.type = "button";
		playButton.value = "Test";
		playButton.classList.add("with-icon");
		playButton.style.backgroundImage = "url(mono/play.svg?light)";
		this.tabsPanel.appendChild(playButton);

		playButton.onclick = ()=> {
			if (this.enableNotificationSoundCheckbox.checked === false) {
				return;
			}

			//playButton.disabled = true;

			const audio = new Audio();
			audio.src = "notification.ogg";
			audio.volume = this.notificationVolume.value / 100;
			audio.play();

			audio.onended = ()=> {
				playButton.disabled = false;
				playButton.focus();
			};
		};

		this.openChatWindowOnMessageCheckbox.checked = localStorage.getItem("focus_chat_window") === "true";
		this.enableNotificationSoundCheckbox.checked = localStorage.getItem("enable_notification_sound") !== "false";
		this.notificationVolume.value = localStorage.getItem("notification_volume") == null ? 80 : parseInt(localStorage.getItem("notification_volume"));

		const Apply = ()=> {
			localStorage.setItem("focus_chat_window", this.openChatWindowOnMessageCheckbox.checked);
			localStorage.setItem("enable_notification_sound", this.enableNotificationSoundCheckbox.checked);
			localStorage.setItem("notification_volume", this.notificationVolume.value);

			for (let i = 0; i < WIN.array.length; i++) {
				if (WIN.array[i] instanceof Personalize && WIN.array[i].args === "chat") {
					WIN.array[i].openChatWindowOnMessageCheckbox.checked = this.openChatWindowOnMessageCheckbox.checked;
					WIN.array[i].enableNotificationSoundCheckbox.checked = this.enableNotificationSoundCheckbox.checked;
					WIN.array[i].notificationVolume.value           = this.notificationVolume.value;

					WIN.array[i].notificationVolume.disabled = !this.enableNotificationSoundCheckbox.checked;
					WIN.array[i].notificationVolumeValue.textContent = `${this.notificationVolume.value}%`;
				}
			}

			if (KEEP.chatNotificationSound) {
				KEEP.chatNotificationSound.volume = this.notificationVolume.value / 100;
			}
		};

		this.openChatWindowOnMessageCheckbox.onchange = ()=> Apply();
		this.enableNotificationSoundCheckbox.onchange = ()=> Apply();
		this.notificationVolume.onchange = this.notificationVolume.oninput = ()=> Apply();

		Apply();
	}

	ShowAgent() {
		this.args = "agent";
		this.tabsPanel.textContent = "";

		const keyLabel = document.createElement("div");
		keyLabel.textContent = "Pre-shared key: ";
		keyLabel.style.display = "inline-block";
		keyLabel.style.minWidth = "150px";
		keyLabel.style.fontWeight = "600";

		this.presharedKeyInput = document.createElement("input");
		this.presharedKeyInput.type = "text";
		this.presharedKeyInput.value = localStorage.getItem("agent_key");
		this.presharedKeyInput.style.width = "200px";

		this.tabsPanel.append(keyLabel, this.presharedKeyInput);

		this.tabsPanel.appendChild(document.createElement("br"));
		this.tabsPanel.appendChild(document.createElement("br"));

		const settingsButton = document.createElement("input");
		settingsButton.type = "button";
		settingsButton.value = "Prompt agent settings";
		settingsButton.style.padding = "8px 16px";
		settingsButton.style.height = "36px";
		this.tabsPanel.appendChild(settingsButton);

		this.tabsPanel.appendChild(document.createElement("br"));
		this.tabsPanel.appendChild(document.createElement("br"));
		this.tabsPanel.appendChild(document.createElement("hr"));
		this.tabsPanel.appendChild(document.createElement("br"));

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
		link.textContent = "Download agent";
		this.tabsPanel.appendChild(link);

		this.tabsPanel.appendChild(document.createElement("br"));
		this.tabsPanel.appendChild(document.createElement("br"));
		this.tabsPanel.appendChild(document.createElement("hr"));

		this.tabsPanel.appendChild(document.createElement("br"));

		this.preferRdpFileCheckbox = document.createElement("input");
		this.preferRdpFileCheckbox.type = "checkbox";
		this.tabsPanel.appendChild(this.preferRdpFileCheckbox);
		this.AddCheckBoxLabel(this.tabsPanel, this.preferRdpFileCheckbox, "Prefer to download RDP file");
		this.tabsPanel.appendChild(document.createElement("br"));
		this.tabsPanel.appendChild(document.createElement("br"));

		this.preferVncFileCheckbox = document.createElement("input");
		this.preferVncFileCheckbox.type = "checkbox";
		this.tabsPanel.appendChild(this.preferVncFileCheckbox);
		this.AddCheckBoxLabel(this.tabsPanel, this.preferVncFileCheckbox, "Prefer to download VNC file");
		this.tabsPanel.appendChild(document.createElement("br"));
		this.tabsPanel.appendChild(document.createElement("br"));

		this.preferRdpFileCheckbox.checked = localStorage.getItem("prefer_rdp_file") === "true";
		this.preferVncFileCheckbox.checked = localStorage.getItem("prefer_cnv_file") === "true";

		const Apply = ()=> {
			localStorage.setItem("agent_key", this.presharedKeyInput.value);
			localStorage.setItem("prefer_rdp_file", this.preferRdpFileCheckbox.checked);
			localStorage.setItem("prefer_cnv_file", this.preferVncFileCheckbox.checked);

			for (let i = 0; i < WIN.array.length; i++) { //update other setting windows
				if (WIN.array[i] instanceof Personalize && WIN.array[i].args === "agent" && WIN.array[i] !== this) {
					WIN.array[i].presharedKeyInput.value = this.presharedKeyInput.value;
					WIN.array[i].preferRdpFileCheckbox.checked = this.preferRdpFileCheckbox.checked;
					WIN.array[i].preferVncFileCheckbox.checked = this.preferVncFileCheckbox.checked;
				}
			}
		};

		this.preferRdpFileCheckbox.onchange = Apply;
		this.preferVncFileCheckbox.onchange = Apply;
		this.presharedKeyInput.onchange = Apply;

		this.presharedKeyInput.onkeydown = event=> {
			if (event.key === "Enter") Apply();
		};

		settingsButton.onclick = ()=> {
			if (this.presharedKeyInput.value === "") {
				this.ConfirmBox("Agent is not configured. Please set a preshared key.", true, "mono/agent.svg");
			}
			else {
				UI.PromptAgent(this, "settings", "--");
			}
		};
	}

	ClearCache() {
		const okButton = this.ConfirmBox("Are you sure you want clear local storage? The page will reload after the cleaning.", false);
		if (okButton) okButton.addEventListener("click", ()=> {
			localStorage.clear();
			location.reload();
		});
	}
}