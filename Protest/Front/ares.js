"use strict";
class Ares extends Window {
	static markdown = null;
	static speechOwner = null;

	constructor(args) {
		super();

		this.args = args ?? {agent:null, model:null};
		this.connection = null;
		this.settingsController = null;
		this.settingsBusy = false;
		this.agents = [];
		this.modelCatalog = null;
		this.effortPreferences = new Map();
		this.modelPreferences = new Map();

		if (this.args.agent && this.args.model) {
			this.effortPreferences.set(JSON.stringify([this.args.agent, this.args.model]), this.args.reasoning ?? "");
			this.modelPreferences.set(this.args.agent, this.args.model);
		}

		this.canUse = false;
		this.messages = [];
		this.requestController = null;
		this.speech = null;
		this.speechSettings = {rate:1, volume:1};
		this.speechVoice = "";

		this.outgoing = Object.create(null);

		Window.AddCssDependencies("ares.css");

		this.SetTitle("A.R.E.S.");
		this.SetIcon("mono/ares.svg");

		this.InitializeComponents();
		this.UpdateAuthorization();
	}

	Close() { //overrides
		this.StopSpeech();
		this.requestController?.abort();
		this.settingsController?.abort();
		this.layoutObserver?.disconnect();
		super.Close();
	}

	UpdateAuthorization() { //overrides
		super.UpdateAuthorization();
		const previouslyAllowed = this.canUse;
		this.canUse = KEEP.authorization.includes("*") || KEEP.authorization.includes("ares:write");
		if (!this.canUse) {
			this.requestController?.abort();
			this.settingsController?.abort();
			this.StopSpeech();
		}
		if (!this.input) return;
		this.UpdateSettingsControls();
		if (!this.canUse) this.SetSettingsError("A.R.E.S. access is required. Contact your administrator.");
		else if (!previouslyAllowed && this.settingsInitialized) this.LoadAgents();
	}

	InitializeComponents() {
		this.chatBox = document.createElement("div");
		this.chatBox.className = "ares-box";
		this.content.appendChild(this.chatBox);

		this.input = document.createElement("div");
		this.input.contentEditable = "true";
		this.input.setAttribute("role", "textbox");
		this.input.setAttribute("aria-label", "Ask A.R.E.S.");
		this.input.setAttribute("aria-multiline", "true");
		this.input.className = "ares-input";
		this.content.appendChild(this.input);
		this.defaultElement = this.input;

		this.InitializeSettings();
		this.layoutObserver = new ResizeObserver(()=> this.LayoutComposer());
		this.layoutObserver.observe(this.content);
		this.layoutObserver.observe(this.input);
		this.layoutObserver.observe(this.settingsMenu);

		this.input.onkeydown = event=> this.Input_onkeydown(event);
		this.input.onpaste = event=> {
			event.preventDefault();
			const text = event.clipboardData?.getData("text/plain");
			if (text) this.input.ownerDocument.execCommand("insertText", false, text);
		};
		this.input.ondrop = event=> event.preventDefault();
	}

	InitializeSettings() {
		const doc = this.content.ownerDocument;
		this.settingsMenu = doc.createElement("details");
		this.settingsMenu.className = "ares-settings";
		this.settingsMenu.open = !this.args.agent || !this.args.model;

		this.settingsSummary = doc.createElement("summary");
		this.settingsPanel = doc.createElement("div");
		this.settingsPanel.className = "ares-settings-panel";
		this.settingsPanel.tabIndex = -1;

		const AddSelect = name=> {
			const row = doc.createElement("label");
			row.className = "ares-setting";
			const caption = doc.createElement("span");
			caption.textContent = name;
			const select = doc.createElement("select");
			select.setAttribute("aria-label", name);
			row.append(caption, select);
			this.settingsPanel.appendChild(row);
			return select;
		};

		this.agentSelect = AddSelect("Agent");
		this.modelSelect = AddSelect("Model");

		const effort = doc.createElement("label");
		effort.className = "ares-setting ares-effort";
		effort.textContent = "Effort";
		this.effortRange = doc.createElement("input");
		this.effortRange.type = "range";
		this.effortRange.min = "0";
		this.effortRange.step = "1";
		this.effortRange.setAttribute("aria-label", "Effort");
		this.effortValue = doc.createElement("output");
		effort.append(this.effortRange, this.effortValue);
		this.settingsPanel.appendChild(effort);

		this.settingsError = doc.createElement("div");
		this.settingsError.className = "ares-error";
		this.settingsError.setAttribute("role", "alert");
		this.settingsError.hidden = true;
		this.settingsPanel.appendChild(this.settingsError);
		this.settingsMenu.append(this.settingsSummary, this.settingsPanel);
		this.content.appendChild(this.settingsMenu);

		this.agentSelect.onchange = ()=> this.LoadModels(this.agentSelect.value);
		this.modelSelect.onchange = ()=> this.SelectModel(this.modelSelect.value);
		this.effortRange.oninput = ()=> {
			this.UpdateEffortLabel();
			if (!this.connection) return;
			const value = this.GetEffort();
			this.args.reasoning = value;
			this.effortPreferences.set(this.ConnectionKey(), value);
		};

		this.settingsMenu.addEventListener("focusout", event=> {
			if (!this.settingsMenu.contains(event.relatedTarget)) this.settingsMenu.open = false;
		});

		let expanded = this.settingsMenu.open;
		this.settingsMenu.ontoggle = ()=> {
			if (this.settingsMenu.open) this.settingsSummary.focus({preventScroll:true});
			this.LayoutComposer();
			const opening = this.settingsMenu.open && !expanded;
			expanded = this.settingsMenu.open;
			if (opening) this.LoadAgents();
		};

		this.ConfigureEffort();
		this.settingsInitialized = true;
	}

	LayoutComposer() {
		this.settingsPanel.style.maxHeight = `${Math.max(48, Math.min(240, this.content.clientHeight - 160))}px`;
		const height = this.settingsMenu.offsetHeight;
		this.input.style.bottom = `${height + 16}px`;
		this.input.style.maxHeight = `${Math.max(60, this.content.clientHeight - height - 56)}px`;
		this.chatBox.style.bottom = `${height + this.input.offsetHeight + 24}px`;
	}

	ConnectionKey() { return JSON.stringify([this.connection.agent, this.connection.model]); }

	ConfigureEffort() {
		const supported = this.connection?.reasoning ?? [];
		this.effortValues = ["", ...new Set(supported)];
		//Boolean thinking controls run from Off to On, regardless of discovery order.
		if (supported.length && supported.every(value=> value === "false" || value === "true")) this.effortValues = ["", ...new Set(supported.slice().sort())];
		const saved = this.connection ? this.effortPreferences.get(this.ConnectionKey()) ?? "" : "";
		this.effortRange.max = String(this.effortValues.length - 1);
		this.effortRange.value = String(Math.max(0, this.effortValues.indexOf(saved)));
		this.UpdateEffortLabel();
		this.UpdateSettingsControls();
	}

	GetEffort() { return this.effortValues[Number(this.effortRange.value)] ?? ""; }

	UpdateEffortLabel() {
		const value = this.GetEffort();
		const names = {"":"Default", false:"Off", true:"On", xhigh:"Extra high"};
		const label = Object.hasOwn(names, value) ? names[value] : value.charAt(0).toUpperCase() + value.slice(1);
		if (this.effortValue.textContent !== label) this.effortValue.textContent = label;
		this.effortRange.setAttribute("aria-valuetext", label);
		const model = this.connection?.modelName ?? this.connection?.model;
		const summary = model ? `${model} · ${label}` : "Select model";
		if (this.settingsSummary.textContent !== summary) this.settingsSummary.textContent = summary;
	}

	UpdateSettingsControls() {
		const disabled = !this.canUse || this.settingsBusy;
		if (disabled && this.settingsPanel.contains(this.content.ownerDocument.activeElement)) this.settingsSummary.focus({preventScroll:true});
		this.agentSelect.disabled = disabled || this.agents.length === 0;
		this.modelSelect.disabled = disabled || !this.modelCatalog || this.modelCatalog.agent.id !== this.agentSelect.value;
		this.effortRange.disabled = disabled || !this.connection || this.effortValues.length <= 1;
		this.settingsMenu.setAttribute("aria-busy", String(this.settingsBusy));
	}

	SetSettingsError(text = "") {
		this.settingsError.textContent = text;
		this.settingsError.hidden = !text;
	}

	BeginSettingsRequest() {
		this.settingsController?.abort();
		const controller = new AbortController();
		this.settingsController = controller;
		this.settingsBusy = true;
		this.UpdateSettingsControls();
		this.SetSettingsError();
		return controller;
	}

	IsCurrentSettings(controller) {
		return !this.isClosed && this.canUse && this.settingsController === controller && !controller.signal.aborted;
	}

	FinishSettingsRequest(controller) {
		if (this.settingsController !== controller) return;
		this.settingsController = null;
		this.settingsBusy = false;
		this.UpdateSettingsControls();
	}

	LoadAgents() { return this.LoadOptions(); }
	LoadModels(agentId) { return this.LoadOptions(agentId); }
	SelectModel(modelId) { return this.LoadOptions(this.agentSelect.value, modelId); }

	async LoadOptions(agentId = null, modelId = null) {
		if (!this.canUse || this.isClosed) return;

		const controller = this.BeginSettingsRequest();
		const ReadOptions = async url=> {
			const response = await fetch(url, {signal:controller.signal});
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
			const result = await response.json();
			if (!this.IsCurrentSettings(controller)) throw new Error("The request was canceled.");
			if (result.error) throw new Error(result.error);
			return result;
		};

		try {
			const agents = agentId === null ? await ReadOptions("ares/agents") : this.agents;
			if (!agents.length) throw new Error("No enabled agents. Add an agent in Infrastructure → A.R.E.S., then reopen this menu.");

			const agent = agents.find(entry=> entry.id === (agentId ?? this.args.agent)) ?? (agentId === null ? agents[0] : null);
			if (!agent) throw new Error("The agent settings changed. Close and reopen this menu to refresh the options.");

			const catalog = modelId !== null && this.modelCatalog?.agent.id === agent.id ? this.modelCatalog : await ReadOptions(`ares/models?id=${encodeURIComponent(agent.id)}`);
			if (catalog.agent.id !== agent.id || catalog.agent.name !== agent.name || catalog.agent.type !== agent.type) throw new Error("The agent settings changed. Close and reopen this menu to refresh the options.");
			if (!catalog.models.length) throw new Error("No models are available for this agent.");

			const preferred = this.modelPreferences.get(agent.id) ?? (this.args.agent === agent.id ? this.args.model : null);
			modelId ??= catalog.models.some(model=> model.id === preferred) ? preferred : catalog.models[0].id;

			const current = await ReadOptions(`ares/models?id=${encodeURIComponent(agent.id)}&model=${encodeURIComponent(modelId)}`);
			if (current.revision !== catalog.revision || current.agent.id !== catalog.agent.id) throw new Error("The agent settings changed. Close and reopen this menu to refresh the options.");

			const model = current.models.find(entry=> entry.id === modelId);
			if (!model) throw new Error("The selected model is no longer available. Close and reopen this menu to refresh the options.");

			const ReplaceOptions = (select, options)=> {
				if (select.options.length !== options.length || options.some((option, index)=> option.value !== select.options[index].value || option.text !== select.options[index].text)) select.replaceChildren(...options);
			};

			ReplaceOptions(this.agentSelect, agents.map(entry=> new Option(`${entry.name} (${entry.label})`, entry.id)));
			ReplaceOptions(this.modelSelect, current.models.map(entry=> new Option(entry.name === entry.id ? entry.id : `${entry.name} (${entry.id})`, entry.id)));

			this.agentSelect.value = agent.id;
			this.modelSelect.value = model.id;
			this.agents = agents;
			this.modelCatalog = current;
			this.connection = Object.freeze({
				agent:current.agent.id, agentName:current.agent.name, provider:current.agent.type,
				model:model.id, modelName:model.name, revision:current.revision,
				reasoning:Object.freeze(current.reasoning ?? [])
			});

			this.args.agent = this.connection.agent;
			this.args.model = this.connection.model;
			this.modelPreferences.set(this.connection.agent, this.connection.model);
			this.ConfigureEffort();
			this.args.reasoning = this.GetEffort();
			this.SetSettingsError();
		}
		catch (ex) {
			if (this.IsCurrentSettings(controller)) {
				this.connection = null;
				this.SetSettingsError(ex.message ?? String(ex));
			}
		}
		finally { this.FinishSettingsRequest(controller); }
	}

	Input_onkeydown(event) {
		if (event.isComposing) return;

		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			this.Send();
		}
		else if (event.key === "Escape") {
			this.ClearInput();
		}
	}

	ClearInput() {
		this.input.textContent = "";
	}

	async Send() {
		if (this.isClosed || !this.canUse || !this.connection || this.settingsBusy || this.requestController) return;
		if (this.input.innerHTML.length === 0) return;

		if (this.input.innerHTML === "<br>") {
			this.ClearInput();
			return;
		}

		//Preserve Markdown indentation and the editor's visual line breaks.
		const text = this.input.innerText.replaceAll(" ", " ").replace(/\r\n?/g, "\n").replace(/^\n+|\n+$/g, "");

		if (text.length > Chat.MAX_TEXT_LENGTH) {
			this.ConfirmBox(`The message is too long, the limit is ${Chat.MAX_TEXT_LENGTH} characters.`, true, "mono/ares.svg");
			return;
		}

		if (this.input.querySelector("img")) {
			this.ConfirmBox("Only text messages are supported for now.", true, "mono/ares.svg");
			return;
		}
		if (text.trim().length === 0) return;

		const connection = this.connection;
		const messages = [...this.messages, {role:"user", content:text}];
		const controller = new AbortController();
		this.requestController = controller;
		this.UpdateAuthorization();
		this.chatBox.setAttribute("aria-busy", "true");

		const nowString = new Date().toLocaleTimeString(UI.regionalFormat, {});
		const id = `${KEEP.username}${UI.GenerateUuid()}`;
		const bubble = this.CreateTextBubble(text, "out", KEEP.username, "", KEEP.color, nowString, id);
		bubble.style.color = "var(--clr-pane)";
		bubble.style.backgroundColor = "transparent";
		bubble.style.boxShadow = "var(--clr-pane) 0 0 0 2px inset";

		const reply = this.CreateTextBubble("Thinking…", "in", `ares:${connection.agent}`, `${connection.agentName} · ${connection.modelName}`, "var(--clr-accent)", nowString);
		reply.classList.add("ares-thinking");
		reply.setAttribute("role", "status");
		reply.setAttribute("aria-busy", "true");
		this.UpdateSpeechButton(reply.closest(".ares-response"));
		this.ClearInput();

		let responseText = "";
		let renderFrame = null;
		const RenderReply = ()=> {
			if (renderFrame !== null) cancelAnimationFrame(renderFrame);
			renderFrame = null;
			if (this.isClosed || (responseText.length === 0 && reply.classList.contains("ares-thinking"))) return;
			const follow = this.IsScrolledToBottom();
			const wasThinking = reply.classList.contains("ares-thinking");
			reply.classList.remove("ares-thinking");
			Ares.RenderMarkdown(reply, responseText);
			if (wasThinking) this.UpdateSpeechButton(reply.closest(".ares-response"));
			if (follow) this.chatBox.scrollTop = this.chatBox.scrollHeight;
		};

		try {
			const response = await fetch(`ares/chat?id=${encodeURIComponent(connection.agent)}`, {
				method:"POST",
				headers:{"Content-Type":"application/json"},
				body:JSON.stringify({model:connection.model, revision:connection.revision, messages, reasoning:this.GetEffort() || undefined}),
				signal:controller.signal
			});

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
			if (!response.headers.get("Content-Type")?.startsWith("application/x-ndjson")) {
				const result = await response.json();
				throw new Error(result.error ?? "The agent returned an invalid response.");
			}

			let accepted = false;
			let completed = false;
			await Ares.ReadChatStream(response, event=> {
				if (this.isClosed || controller.signal.aborted) throw new Error("The request was canceled.");
				if (completed) throw new Error("The agent returned an invalid response.");
				if (event.type === "error") throw new Error(event.error ?? "Unable to get a response from this agent.");
				if (event.type === "accepted" && !accepted) {
					accepted = true;
					bubble.style.color = "var(--clr-dark)";
					bubble.style.backgroundColor = "var(--clr-pane)";
					bubble.style.boxShadow = "none";
					delete this.outgoing[id];
				}
				else if (event.type === "delta" && accepted && typeof event.text === "string") {
					responseText += event.text;
					if (renderFrame === null) renderFrame = requestAnimationFrame(RenderReply);
				}
				else if (event.type === "done" && accepted && responseText.trim().length > 0) {
					RenderReply();
					completed = true;
				}
				else {
					throw new Error("The agent returned an invalid or empty text response.");
				}
			});
			if (!completed) throw new Error("The response was interrupted. Try again.");
			this.messages = [...messages, {role:"assistant", content:responseText}];
		}
		catch (ex) {
			if (this.isClosed) return;
			const follow = this.IsScrolledToBottom();
			const error = controller.signal.aborted ? "A.R.E.S. access is required. Contact your administrator." : ex.message ?? String(ex);
			reply.classList.remove("ares-thinking");
			RenderReply();
			reply.removeAttribute("role");
			const errorBox = reply.ownerDocument.createElement("div");
			errorBox.className = "ares-error";
			errorBox.textContent = error;
			errorBox.setAttribute("role", "alert");
			if (responseText.length > 0) errorBox.style.marginTop = "12px";
			reply.append(errorBox);
			if (follow) this.chatBox.scrollTop = this.chatBox.scrollHeight;
		}
		finally {
			if (renderFrame !== null) cancelAnimationFrame(renderFrame);
			const follow = !this.isClosed && this.IsScrolledToBottom();
			this.requestController = null;
			delete this.outgoing[id];
			reply.classList.remove("ares-thinking");
			reply.removeAttribute("aria-busy");
			reply.removeAttribute("role");
			this.UpdateSpeechButton(reply.closest(".ares-response"));
			if (follow) this.chatBox.scrollTop = this.chatBox.scrollHeight;
			this.chatBox.removeAttribute("aria-busy");
			if (!this.isClosed) {
				this.UpdateAuthorization();
				if (this.canUse && !this.settingsMenu.contains(this.content.ownerDocument.activeElement) &&
					!this.speech?.panel.contains(this.content.ownerDocument.activeElement) &&
					(WIN.focused === this || this.popOutWindow?.document.hasFocus())) this.input.focus();
			}
		}
	}

	AddSpeechButton(response) {
		const button = response.ownerDocument.createElement("button");
		button.type = "button";
		button.className = "ares-speak";
		button.setAttribute("aria-label", "Read response aloud");
		button.setAttribute("aria-pressed", "false");
		button.hidden = true;
		button.onclick = ()=> this.StartSpeech(response);
		response.appendChild(button);
	}

	UpdateSpeechButton(response) {
		const button = response?.querySelector(":scope > .ares-speak");
		if (!button) return;
		const supported = !!window.speechSynthesis && typeof window.SpeechSynthesisUtterance === "function";
		const hasText = Ares.GetSpeechSegments(response).length > 0;
		button.hidden = !!response.querySelector('.ares-thinking, .ares-bubble[aria-busy="true"]') || !hasText;
		button.disabled = !supported;
	}

	static GetSpeechSegments(response) {
		const segments = [];
		const blocks = new Set(["DIV", "P", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "BLOCKQUOTE", "PRE", "TABLE", "THEAD", "TBODY", "TFOOT", "TR"]);
		const Skip = element=> element.matches('.ares-error, button, input, script, style, [aria-hidden="true"]');
		const InlineText = node=> {
			if (node.nodeType === 3) return node.textContent;
			if (node.nodeType !== 1 || Skip(node)) return "";
			if (node.tagName === "BR") return "\n";
			return Array.from(node.childNodes, InlineText).join("") + (["TH", "TD"].includes(node.tagName) ? " ": "");
		};

		const Visit = element=> {
			if (element.tagName === "PRE") {
				segments.push({element, text:"See code block"});
				return;
			}
			let text = "";
			const Flush = ()=> {
				const content = text.replace(/\s+/g, " ").trim();
				if (content) segments.push({element, text:content});
				text = "";
			};
			for (const child of element.childNodes) {
				if (child.nodeType === 1 && Skip(child)) continue;
				if (child.nodeType === 1 && blocks.has(child.tagName)) {
					Flush();
					Visit(child);
				}
				else text += InlineText(child);
			}
			Flush();
		};

		for (const bubble of response.querySelectorAll('.ares-bubble:not([aria-busy="true"])')) Visit(bubble);
		return segments;
	}

	StartSpeech(response) {
		if (this.isClosed || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== "function") return;

		const button = response.querySelector(":scope > .ares-speak");
		if (!button || button.disabled || button.hidden) return;
		if (this.speech?.response === response) {
			this.StopSpeech();
			return;
		}

		const segments = Ares.GetSpeechSegments(response);
		if (segments.length === 0) return;
		Ares.speechOwner?.StopSpeech();
		response.querySelector(":scope > .ares-speech-error")?.remove();
		let text = "";
		for (const segment of segments) {
			//Keep native speech continuous; highlight offsets track sections separately.
			if (text.length > 0) text += " ";
			segment.start = text.length;
			text += segment.text;
			if (!/[.!?…]["'’”)\]]*$/.test(segment.text)) text += ".";
		}

		const state = {response, button, segments, text, index:0, offset:0, boundary:0, paused:false, utterance:null, synth:window.speechSynthesis};
		this.speech = state;
		Ares.speechOwner = this;
		button.setAttribute("aria-pressed", "true");
		button.setAttribute("aria-label", "Stop reading response");
		this.CreateSpeechMenu(state);

		const box = this.chatBox.getBoundingClientRect();
		const first = segments[0].element.getBoundingClientRect();
		this.chatBox.scrollTo({top:this.chatBox.scrollTop + first.top - box.top - 16, behavior:"smooth"});
		try {
			state.synth.resume();
			this.SpeakResponse(state);
		}
		catch {
			this.SpeechFailed(state);
		}
	}

	CreateSpeechMenu(state) {
		const doc = this.content.ownerDocument;
		const panel = doc.createElement("div");
		panel.className = "ares-speech-menu";
		panel.setAttribute("role", "region");
		panel.setAttribute("aria-label", "Read aloud controls");

		const status = doc.createElement("div");
		status.className = "ares-speech-status";
		status.setAttribute("role", "status");

		const controls = doc.createElement("div");
		controls.className = "ares-speech-actions";

		const AddButton = (icon, label, handler)=> {
			const button = doc.createElement("button");
			button.type = "button";
			button.className = `ares-speech-control ares-speech-${icon}`;
			button.setAttribute("aria-label", label);
			button.onclick = handler;
			controls.appendChild(button);
			return button;
		};

		state.playButton = AddButton("pause", "Pause", ()=> state.paused ? this.ResumeSpeech() : this.PauseSpeech());
		AddButton("stop", "Stop", ()=> this.StopSpeech());
		state.previousButton = AddButton("previous", "Previous section", ()=> this.SkipSpeech(-1));
		state.nextButton = AddButton("next", "Next section", ()=> this.SkipSpeech(1));

		controls.appendChild(status);
		panel.appendChild(controls);
		panel.appendChild(this.CreateSpeechVoiceSelector(state));

		const AddSlider = (name, key, min, max, step, Format)=> {
			const label = doc.createElement("label");
			label.className = "ares-speech-setting";
			const caption = doc.createElement("span");
			caption.textContent = name;
			const slider = doc.createElement("input");
			slider.type = "range";
			slider.min = min;
			slider.max = max;
			slider.step = step;
			slider.value = this.speechSettings[key];
			slider.setAttribute("aria-label", name);

			const value = doc.createElement("span");
			const Update = ()=> {
				this.speechSettings[key] = Number(slider.value);
				value.textContent = Format(this.speechSettings[key]);
				slider.setAttribute("aria-valuetext", value.textContent);
			};

			Update();
			slider.oninput = Update;
			slider.onchange = ()=> {
				Update();
				this.RestartSpeech(state);
			};

			label.append(caption, slider, value);
			panel.appendChild(label);
		};

		AddSlider("Rate", "rate", .5, 2, .1, value=> `${value.toFixed(1)}×`);
		AddSlider("Volume", "volume", 0, 1, .05, value=> `${Math.round(value * 100)}%`);
		state.panel = panel;
		state.status = status;
		this.content.appendChild(panel);
		this.UpdateSpeechMenu(state);
	}

	static SpeechVoiceId(voice) {
		return JSON.stringify([voice.voiceURI, voice.lang, voice.name]);
	}

	CreateSpeechVoiceSelector(state) {
		const doc = this.content.ownerDocument;

		const label = doc.createElement("label");
		label.className = "ares-speech-voice";

		const caption = doc.createElement("span");
		caption.textContent = "Voice";

		const select = doc.createElement("select");
		select.setAttribute("aria-label", "Voice");
		state.updateVoices = ()=> {
			if (this.speech !== state) return;
			const voices = state.synth.getVoices().filter(voice=> /^en(?:-|$)/i.test(voice.lang)).sort((a, b)=> a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));

			const AddOption = (text, value)=> {
				const option = doc.createElement("option");
				option.textContent = text;
				option.value = value;
				select.appendChild(option);
			};

			select.replaceChildren();
			AddOption("Browser default", "");
			for (const voice of voices) {
				AddOption(`${voice.name} (${voice.lang})${voice.default ? " · Default" : ""}`, Ares.SpeechVoiceId(voice));
			}

			if (voices.length > 0 && !voices.some(voice=> Ares.SpeechVoiceId(voice) === this.speechVoice)) this.speechVoice = "";
			select.value = voices.length > 0 ? this.speechVoice : "";
			select.disabled = voices.length === 0;
		};

		select.onchange = ()=> {
			if (this.speech !== state) return;
			this.speechVoice = select.value;
			this.RestartSpeech(state);
		};
		state.synth.addEventListener("voiceschanged", state.updateVoices);
		state.updateVoices();
		label.append(caption, select);
		return label;
	}

	UpdateSpeechMenu(state) {
		state.previousButton.disabled = state.index === 0;
		state.nextButton.disabled = state.index === state.segments.length - 1;
		const label = state.paused ? "Resume" : "Pause";
		if (state.playButton.getAttribute("aria-label") !== label) {
			state.playButton.classList.toggle("ares-speech-play", state.paused);
			state.playButton.classList.toggle("ares-speech-pause", !state.paused);
			state.playButton.setAttribute("aria-label", label);
		}

		const count = `${state.index + 1} / ${state.segments.length}`;
		const status = `${state.paused ? "Paused" : "Reading"}, section ${state.index + 1} of ${state.segments.length}`;
		if (state.status.textContent !== count) state.status.textContent = count;
		if (state.status.getAttribute("aria-label") !== status) state.status.setAttribute("aria-label", status);
	}

	HighlightSpeech(state, position) {
		while (state.index + 1 < state.segments.length && state.segments[state.index + 1].start <= position) state.index++;
		const element = state.segments[state.index].element;
		if (state.highlight !== element) {
			state.highlight?.classList.remove("ares-speaking");
			state.highlight = element;
			element.classList.add("ares-speaking");
		}
		this.UpdateSpeechMenu(state);
	}

	SpeakResponse(state) {
		if (this.speech !== state || state.paused) return;
		if (state.offset >= state.text.length || !state.response.isConnected) {
			this.StopSpeech(false);
			return;
		}

		const offset = state.offset;
		let end = Math.min(state.text.length, offset + 30000);
		if (end < state.text.length) {
			const space = state.text.lastIndexOf(" ", end);
			if (space > offset + 20000) end = space;
			if (/[\uD800-\uDBFF]/.test(state.text[end - 1])) end--;
		}

		const utterance = new window.SpeechSynthesisUtterance(state.text.slice(offset, end));
		Object.assign(utterance, this.speechSettings);
		const voice = state.synth.getVoices().find(candidate=> Ares.SpeechVoiceId(candidate) === this.speechVoice);
		if (voice) {
			utterance.voice = voice;
			utterance.lang = voice.lang;
		}

		state.utterance = utterance; //Keep a reference while the browser is speaking.
		state.boundary = offset;
		const IsCurrent = ()=> this.speech === state && state.utterance === utterance;
		utterance.onstart = ()=> {
			if (IsCurrent()) this.HighlightSpeech(state, offset);
		};
		utterance.onboundary = event=> {
			if (IsCurrent() && Number.isInteger(event.charIndex) && event.charIndex >= 0 && event.charIndex < utterance.text.length) {
				state.boundary = offset + event.charIndex;
				this.HighlightSpeech(state, state.boundary);
			}
		};

		utterance.onend = ()=> {
			if (!IsCurrent()) return;
			state.utterance = null;
			state.offset = state.boundary = end;
			if (end >= state.text.length) this.StopSpeech(false);
			else if (!state.paused) this.SpeakResponse(state);
		};

		utterance.onerror = ()=> { if (IsCurrent()) this.SpeechFailed(state); };
		try {
			state.synth.speak(utterance);
		}
		catch {
			this.SpeechFailed(state);
		}
	}

	PauseSpeech() {
		const state = this.speech;
		if (!state || state.paused) return;
		state.paused = true;
		state.synth.pause();
		this.UpdateSpeechMenu(state);
	}

	ResumeSpeech() {
		const state = this.speech;
		if (!state || !state.paused) return;
		state.paused = false;
		state.synth.resume();
		if (!state.utterance) this.SpeakResponse(state);
		if (this.speech === state) this.UpdateSpeechMenu(state);
	}

	SkipSpeech(direction) {
		const state = this.speech;
		if (!state) return;
		const index = state.index + direction;
		if (index < 0 || index >= state.segments.length) return;
		state.index = index;
		state.boundary = state.segments[index].start;
		this.HighlightSpeech(state, state.boundary);
		this.RestartSpeech(state);
	}

	RestartSpeech(state) {
		if (this.speech !== state) return;
		//Apply settings to a new utterance at the last reported word boundary.
		state.offset = state.boundary;
		state.utterance = null; //Ignore cancellation events from the old utterance.
		state.synth.cancel();
		if (!state.paused) {
			state.synth.resume();
			this.SpeakResponse(state);
		}
	}

	StopSpeech(cancel = true) {
		const state = this.speech;
		if (!state) return;

		this.speech = null;
		if (Ares.speechOwner === this) Ares.speechOwner = null;
		state.synth.removeEventListener("voiceschanged", state.updateVoices);

		if (cancel) state.synth.cancel();
		state.highlight?.classList.remove("ares-speaking");
		state.button.setAttribute("aria-pressed", "false");
		state.button.setAttribute("aria-label", "Read response aloud");

		const focusInput = state.panel.contains(state.panel.ownerDocument.activeElement);
		state.panel.remove();
		if (focusInput && !this.isClosed) this.input.focus({preventScroll:true});
	}

	SpeechFailed(state) {
		if (this.speech !== state) return;
		this.StopSpeech();
		const error = state.response.ownerDocument.createElement("div");
		error.className = "ares-error ares-speech-error";
		error.setAttribute("role", "alert");
		error.textContent = "Unable to read this response aloud. Check your browser's speech voices and audio settings.";
		state.response.insertBefore(error, state.button);
	}

	static RenderMarkdown(element, text) {
		element.classList.add("ares-markdown");
		//Keep messages readable if either bundled dependency failed to load.
		if (typeof marked === "undefined" || typeof DOMPurify === "undefined" || !DOMPurify.isSupported) {
			element.textContent = text;
			element.style.whiteSpace = "pre-wrap";
			return;
		}
		element.style.removeProperty("white-space");

		Ares.markdown ??= new marked.Marked({
			gfm:true,
			breaks:true,
			renderer: {
				html({text}) { return WIN.EscapeHtml(text); },
				image({href, text}) { return `<a href="${WIN.EscapeHtml(href)}">${WIN.EscapeHtml(text || "Image")}</a>`; }
			}
		});

		const fragment = DOMPurify.sanitize(Ares.markdown.parse(text), {
			ALLOWED_TAGS:["p", "br", "strong", "em", "del", "blockquote", "ul", "ol", "li", "pre", "code", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "a", "table", "thead", "tbody", "tr", "th", "td", "input"],
			ALLOWED_ATTR:["href", "title", "start", "align", "type", "checked", "disabled"],
			ALLOW_DATA_ATTR:false,
			ALLOW_ARIA_ATTR:false,
			RETURN_DOM_FRAGMENT:true
		});

		for (const link of fragment.querySelectorAll("a")) {
			const href = link.getAttribute("href");
			if (!href) continue;
			try {
				const url = new URL(href, element.ownerDocument.baseURI);
				if (!["http:", "https:", "mailto:"].includes(url.protocol)) throw new Error("Unsupported link");
				link.href = url.href;
				link.target = "_blank";
				link.rel = "noopener noreferrer";
			}
			catch {
				link.removeAttribute("href");
			}
		}
		for (const checkbox of fragment.querySelectorAll("input")) {
			checkbox.type = "checkbox";
			checkbox.disabled = true;
		}

		Ares.AddCodeCopyButtons(fragment);
		element.replaceChildren(fragment);
	}

	static AddCodeCopyButtons(fragment) {
		const doc = fragment.ownerDocument;
		for (const pre of fragment.querySelectorAll("pre")) {
			const code = pre.querySelector("code");

			if (!code) continue;

			const wrapper = doc.createElement("div");
			wrapper.className = "ares-code-block";

			const button = doc.createElement("button");
			button.type = "button";
			button.className = "ares-code-copy";
			button.setAttribute("aria-label", "Copy code");

			let resetTimer = null;
			const ResetFeedback = ()=> {
				clearTimeout(resetTimer);
				resetTimer = null;
				button.textContent = "Copy";
				button.setAttribute("aria-label", "Copy code");
			};

			ResetFeedback();
			button.onclick = async ()=> {
				ResetFeedback();
				wrapper.querySelector(".ares-code-copy-error")?.remove();
				button.disabled = true;

				try {
					await Ares.CopyCodeText(code);
					button.textContent = "Copied";
					button.setAttribute("aria-label", "Code copied");
					resetTimer = setTimeout(ResetFeedback, 2000);
				}
				catch {
					const error = doc.createElement("div");
					error.className = "ares-error ares-code-copy-error";
					error.setAttribute("role", "alert");
					error.textContent = "Unable to copy. Select the code and copy it manually.";
					wrapper.appendChild(error);
				}
				finally {
					button.disabled = false;
				}
			};
			pre.replaceWith(wrapper);
			wrapper.append(pre, button);
		}
	}

	static async CopyCodeText(code) {
		const doc = code.ownerDocument;
		const text = code.textContent;
		try {
			const clipboard = doc.defaultView?.navigator.clipboard;
			if (clipboard?.writeText) {
				await clipboard.writeText(text);
				return;
			}
		}
		catch {}

		const focused = doc.activeElement;
		const selection = doc.getSelection();
		const ranges = Array.from({length:selection.rangeCount}, (_, index)=> selection.getRangeAt(index).cloneRange());
		const textarea = doc.createElement("textarea");
		textarea.value = text;
		textarea.readOnly = true;
		textarea.tabIndex = -1;
		textarea.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
		doc.body.appendChild(textarea);

		try {
			textarea.select();
			if (!doc.execCommand("copy")) throw new Error("Copy failed");
		}
		finally {
			textarea.remove();
			if (focused?.isConnected) focused.focus({preventScroll:true});
			selection.removeAllRanges();
			for (const range of ranges) {
				if (range.commonAncestorContainer.isConnected) selection.addRange(range);
			}
		}
	}

	static async ReadChatStream(response, onEvent) {
		if (!response.body) throw new Error("The agent returned no response stream.");
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let pending = "";
		try {
			while (true) {
				const {value, done} = await reader.read();
				pending += done ? decoder.decode() : decoder.decode(value, {stream:true});
				let newline;
				while ((newline = pending.indexOf("\n")) !== -1) {
					const line = pending.slice(0, newline).trim();
					pending = pending.slice(newline + 1);
					if (line.length > 0) onEvent(JSON.parse(line));
				}
				if (done) break;
			}
			if (pending.trim().length > 0) onEvent(JSON.parse(pending));
		}
		finally {
			await reader.cancel().catch(()=> {});
			reader.releaseLock();
		}
	}

	IsScrolledToBottom() {
		return this.chatBox.scrollTop + this.chatBox.clientHeight - this.chatBox.scrollHeight >= -96;
	}

	CreateBubble(direction, sender, alias, color, time) {
		let group;

		const wrapper = document.createElement("div");
		wrapper.tabIndex = 0;
		wrapper.className = direction;

		const bubble = document.createElement("div");
		bubble.className = "ares-bubble";

		if (this.lastBubble && this.lastBubble.sender === sender) {
			if (direction === "out") {
				const timeLabel = document.createElement("div");
				timeLabel.className = "ares-timestamp";
				timeLabel.textContent = time;

				this.lastBubble.bubble.style.borderBottomRightRadius = "2px";
				bubble.style.borderTopRightRadius = "2px";

				wrapper.append(timeLabel, bubble);
			}
			else if (direction === "in") {
				this.lastBubble.bubble.style.borderBottomLeftRadius = "2px";
				bubble.style.borderTopLeftRadius = "2px";
				wrapper.append(bubble);
			}

			group = this.lastBubble.group;
		}
		else {
			group = document.createElement("div");
			group.className = direction === "in" ? "ares-group ares-response" : "ares-group";

			const avatar = document.createElement("div");
			avatar.className = "ares-avatar";
			if (direction === "out") {
				avatar.style.backgroundColor = color;
			}

			group.appendChild(avatar);

			if (direction === "out") {
				const timeLabel = document.createElement("div");
				timeLabel.className = "ares-timestamp";
				timeLabel.textContent = time;

				group.style.textAlign = "right";
				group.style.paddingRight = "36px";
				avatar.style.right = "4px";

				wrapper.append(timeLabel, bubble);
			}
			else {
				wrapper.append(bubble);
			}

			if (direction === "in") this.AddSpeechButton(group);
			this.chatBox.appendChild(group);
		}

		this.lastBubble = {
			group: group,
			bubble: bubble,
			sender: sender
		};

		const isScrolledToBottom = this.IsScrolledToBottom();

		group.insertBefore(wrapper, group.querySelector(":scope > .ares-speak"));

		if (isScrolledToBottom) {
			setTimeout(()=> wrapper.scrollIntoView({behavior:"smooth"}), 50);
		}

		return bubble;
	}

	CreateTextBubble(text, direction, sender, alias, color, time, id=null) {
		if (text.length === 0) return;

		const bubble = this.CreateBubble(direction, sender, alias, color, time);
		Ares.RenderMarkdown(bubble, text);
		if (direction === "in") this.UpdateSpeechButton(bubble.closest(".ares-response"));

		if (direction === "out") {
			if (id && !(id in this.outgoing)) {
				this.outgoing[id] = bubble;
			}
		}

		return bubble;
	}
}
