"use strict";
class Ares extends Window {
	static markdown = null;
	static speechOwner = null;

	constructor(args) {
		super();
		this.args = args ?? {agent:null, model:null};
		this.connection = null;
		this.connectionDialog = null;
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
		this.ConnectDialog();
	}

	Close() { //overrides
		this.StopSpeech();
		this.requestController?.abort();
		this.connectionDialog?.listController?.abort();
		this.connectionDialog?.modelsController?.abort();
		this.connectionDialog = null;
		super.Close();
	}

	UpdateAuthorization() { //overrides
		super.UpdateAuthorization();
		const previouslyAllowed = this.canUse;
		this.canUse = KEEP.authorization.includes("*") || KEEP.authorization.includes("ares:write");
		if (!this.canUse) {
			this.requestController?.abort();
			this.StopSpeech();
		}
		if (!this.input) return;

		if (this.connection) {
			//TODO: create a status box
		}

		const state = this.connectionDialog;
		if (!state) return;
		if (!this.canUse) {
			state.listController?.abort();
			state.modelsController?.abort();
			state.agentSelect.disabled = true;
			state.modelSelect.disabled = true;
			state.okButton.disabled = true;
			state.status.textContent = "A.R.E.S. access is required. Contact your administrator.";
		}
		else if (!previouslyAllowed) {
			state.loadAgents();
		}
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

		this.input.onkeydown = event=> this.Input_onkeydown(event);
		this.input.onpaste = event=> {
			event.preventDefault();
			const text = event.clipboardData?.getData("text/plain");
			if (text) this.input.ownerDocument.execCommand("insertText", false, text);
		};
		this.input.ondrop = event=> event.preventDefault();
	}

	ConnectDialog() {
		if (this.isClosed || this.connection || this.connectionDialog) return;
		const dialog = this.DialogBox("210px");
		if (dialog === null) return;
		const {okButton, cancelButton, innerBox} = dialog;
		okButton.value = "Connect";
		okButton.disabled = true;
		innerBox.parentElement.style.maxWidth = "560px";
		innerBox.style.display = "grid";
		innerBox.style.gridTemplateColumns = "72px minmax(0, 1fr)";
		innerBox.style.gridAutoRows = "min-content";
		innerBox.style.alignItems = "center";
		innerBox.style.gap = "12px 8px";
		innerBox.style.padding = "24px 20px";

		const agentLabel = document.createElement("div");
		agentLabel.textContent = "Agent:";
		const agentSelect = document.createElement("select");
		agentSelect.setAttribute("aria-label", "Agent");
		agentSelect.style.minWidth = "0";
		agentSelect.disabled = true;

		const modelLabel = document.createElement("div");
		modelLabel.textContent = "Model:";
		const modelSelect = document.createElement("select");
		modelSelect.setAttribute("aria-label", "Model");
		modelSelect.style.minWidth = "0";
		modelSelect.disabled = true;

		const status = document.createElement("div");
		status.style.gridColumn = "1 / -1";
		status.style.fontSize = "smaller";
		status.setAttribute("role", "status");
		innerBox.append(agentLabel, agentSelect, modelLabel, modelSelect, status);

		const state = {agentSelect, modelSelect, okButton, status, agents:[], selection:null};
		this.connectionDialog = state;
		const IsCurrent = controller=> this.connectionDialog === state && !this.isClosed && !controller.signal.aborted;
		const UpdateConnectState = ()=> {
			okButton.disabled = !this.canUse || agentSelect.options.length === 0 || modelSelect.options.length === 0;
		};

		const ResetModels = ()=> {
			state.selection = null;
			modelSelect.replaceChildren();
			modelSelect.disabled = true;
			UpdateConnectState();
		};

		agentSelect.onchange = async ()=> {
			state.modelsController?.abort();
			ResetModels();
			status.textContent = "";
			const agent = state.agents.find(entry=> entry.id === agentSelect.value);
			if (!agent || !this.canUse) return;
			const controller = new AbortController();
			state.modelsController = controller;
			status.style.textAlign = "center";
			status.textContent = "Loading models…";
			try {
				const response = await fetch(`ares/models?id=${encodeURIComponent(agent.id)}`, {signal:controller.signal});
				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
				const selection = await response.json();
				if (selection.error) throw selection.error;
				if (!IsCurrent(controller)) return;
				if (selection.agent.id !== agent.id || selection.agent.name !== agent.name || selection.agent.type !== agent.type) {
					throw new Error("The agent settings changed. Reopen A.R.E.S. to load the current agents.");
				}
				for (const model of selection.models) {
					modelSelect.add(new Option(model.name === model.id ? model.id : `${model.name} (${model.id})`, model.id));
				}
				if (selection.models.length === 0) throw new Error("No models are available for this agent");
				modelSelect.selectedIndex = 0;
				state.selection = selection;
				modelSelect.disabled = false;
				status.textContent = "";
				UpdateConnectState();
			}
			catch (ex) {
				if (!IsCurrent(controller)) return;
				ResetModels();
				status.textContent = ex.message ?? String(ex);
			}
		};

		state.loadAgents = async ()=> {
			if (!this.canUse || this.isClosed) return;
			state.listController?.abort();
			state.modelsController?.abort();
			
			const controller = new AbortController();
			state.listController = controller;
			agentSelect.replaceChildren();
			agentSelect.disabled = true;
			ResetModels();
			status.textContent = "Loading agents…";
			try {
				const response = await fetch("ares/agents", {signal:controller.signal});
				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
				const agents = await response.json();
				if (agents.error) throw agents.error;
				if (!IsCurrent(controller)) return;
				state.agents = agents;
				for (const agent of agents) {
					agentSelect.add(new Option(`${agent.name} (${agent.label})`, agent.id));
				}
				agentSelect.disabled = agents.length === 0;
				status.textContent = "";
				if (agents.length === 0) status.textContent = "No enabled agents. Add an agent in Infrastructure → A.R.E.S., then reopen A.R.E.S.";
				if (agents.length > 0) await agentSelect.onchange();
			}
			catch (ex) {
				if (!IsCurrent(controller)) return;
				agentSelect.replaceChildren();
				status.textContent = ex.message ?? String(ex);
			}
		};

		okButton.onclick = async ()=> {
			const selection = state.selection;
			const model = selection?.models.find(entry=> entry.id === modelSelect.value);
			if (!this.canUse || !selection || !model || selection.agent.id !== agentSelect.value || okButton.disabled) return;
			const controller = new AbortController();
			state.modelsController = controller;
			agentSelect.disabled = modelSelect.disabled = okButton.disabled = true;
			status.textContent = "Checking the selected agent and model…";
			try {
				const response = await fetch(`ares/models?id=${encodeURIComponent(selection.agent.id)}`, {signal:controller.signal});
				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
				const current = await response.json();
				if (current.error) throw current.error;
				if (!IsCurrent(controller)) return;
				if (current.revision !== selection.revision) throw new Error("The agent settings changed. Reopen A.R.E.S. and confirm your selection.");
				if (!current.models.some(entry=> entry.id === model.id)) throw new Error("The selected model is no longer available. Reopen A.R.E.S. to load its models.");

				this.connection = Object.freeze({
					agent:selection.agent.id,
					agentName:selection.agent.name,
					provider:selection.agent.type,
					model:model.id,
					modelName:model.name,
					revision:selection.revision
				});
				this.args.agent = this.connection.agent;
				this.args.model = this.connection.model;
				this.connectionDialog = null;
				this.UpdateAuthorization();
				dialog.Close();
				this.input.focus();
			}
			catch (ex) {
				if (!IsCurrent(controller)) return;
				ResetModels();
				status.textContent = ex.message ?? String(ex);
			}
			finally {
				if (IsCurrent(controller)) {
					agentSelect.disabled = !this.canUse;
					modelSelect.disabled = !this.canUse || !state.selection;
					UpdateConnectState();
				}
			}
		};

		cancelButton.onclick = ()=> {
			dialog.Close();
			this.Close();
		};
		innerBox.parentElement.addEventListener("keydown", event=> {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			cancelButton.click();
		}, true);

		if (this.canUse) state.loadAgents();
		else this.UpdateAuthorization();

		setTimeout(()=>{agentSelect.focus()}, 200);
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
		if (this.isClosed || !this.canUse || !this.connection || this.requestController) return;
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
				body:JSON.stringify({model:connection.model, revision:connection.revision, messages}),
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
			//this.input.textContent = text;
		}
		finally {
			if (renderFrame !== null) cancelAnimationFrame(renderFrame);
			this.requestController = null;
			reply.classList.remove("ares-thinking");
			reply.removeAttribute("aria-busy");
			reply.removeAttribute("role");
			this.UpdateSpeechButton(reply.closest(".ares-response"));
			this.chatBox.removeAttribute("aria-busy");
			if (!this.isClosed) {
				this.UpdateAuthorization();
				if (this.canUse && !this.speech?.panel.contains(this.content.ownerDocument.activeElement) &&
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
		button.title = supported ? "Read response aloud" : "Read aloud is not supported by this browser";
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
		//The browser's synthesis queue is shared by all A.R.E.S. windows.
		Ares.speechOwner?.StopSpeech();
		response.querySelector(":scope > .ares-speech-error")?.remove();
		let text = "";
		for (const segment of segments) {
			//Keep native speech continuous; highlight offsets track sections separately.
			if (text.length > 0) text += " ";
			segment.start = text.length;
			text += segment.text;
		}
		const state = {response, button, segments, text, index:0, offset:0, boundary:0, paused:false, utterance:null, synth:window.speechSynthesis};
		this.speech = state;
		Ares.speechOwner = this;
		button.setAttribute("aria-pressed", "true");
		button.setAttribute("aria-label", "Stop reading response");
		button.title = "Stop reading response";
		this.CreateSpeechMenu(state);

		//Scroll this chat only, once. Advancing, resuming and changing settings never scroll.
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
			button.title = label;
			button.onclick = handler;
			controls.appendChild(button);
			return button;
		};
		state.playButton = AddButton("pause", "Pause", ()=> state.paused ? this.ResumeSpeech() : this.PauseSpeech());
		AddButton("stop", "Stop", ()=> this.StopSpeech());
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
			const voices = state.synth.getVoices()
				.filter(voice=> /^en(?:-|$)/i.test(voice.lang))
				.sort((a, b)=> a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));
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
		const label = state.paused ? "Resume" : "Pause";
		state.playButton.classList.toggle("ares-speech-play", state.paused);
		state.playButton.classList.toggle("ares-speech-pause", !state.paused);
		state.playButton.setAttribute("aria-label", label);
		state.playButton.title = label;
		state.status.textContent = `${state.index + 1} / ${state.segments.length}`;
		state.status.setAttribute("aria-label", `${state.paused ? "Paused" : "Reading"}, section ${state.index + 1} of ${state.segments.length}`);
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
		//Keep sections in one utterance: Firefox/macOS can click at utterance boundaries.
		//Only split exceptionally long responses to stay below speech-engine text limits.
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
		state.button.title = "Read response aloud";
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
				//Show HTML as text; Markdown images become explicit links instead of remote requests.
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
		element.replaceChildren(fragment);
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
