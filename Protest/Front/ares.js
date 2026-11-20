"use strict";
class Ares extends Window {
	constructor(args) {
		super();
		this.args = args ?? {agent:null, model:null};
		this.connection = null;
		this.connectionDialog = null;
		this.canUse = false;
		this.messages = [];
		this.requestController = null;

		this.outgoing = Object.create(null);

		Window.AddCssDependencies("ares.css");

		this.SetTitle("A.R.E.S.");
		this.SetIcon("mono/ares.svg");

		this.InitializeComponents();
		this.UpdateAuthorization();
		this.ConnectDialog();
	}

	Close() { //overrides
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
		if (!this.canUse) this.requestController?.abort();
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

		const normalizedHtml = this.input.innerHTML.replaceAll(/<br\s*\/?>/gi, "\n").replaceAll(/<\/div>/gi, "\n");

		//an inert document, unlike a detached div nothing in it loads
		const text = new DOMParser().parseFromString(normalizedHtml, "text/html").body.textContent.replaceAll(" ", "\n").trim();

		if (text.length > Chat.MAX_TEXT_LENGTH) {
			this.ConfirmBox(`The message is too long, the limit is ${Chat.MAX_TEXT_LENGTH} characters.`, true, "mono/ares.svg");
			return;
		}

		if (this.input.querySelector("img")) {
			this.ConfirmBox("Only text messages are supported for now.", true, "mono/ares.svg");
			return;
		}
		if (text.length === 0) return;

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
		reply.setAttribute("role", "status");
		this.ClearInput();
		let responseText = "";

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
					const follow = this.IsScrolledToBottom();
					if (responseText.length === 0) reply.textContent = "";
					responseText += event.text;
					reply.append(reply.ownerDocument.createTextNode(event.text));
					if (follow) this.chatBox.scrollTop = this.chatBox.scrollHeight;
				}
				else if (event.type === "done" && accepted && responseText.trim().length > 0) {
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
			reply.textContent = responseText;
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
			this.requestController = null;
			this.chatBox.removeAttribute("aria-busy");
			if (!this.isClosed) {
				this.UpdateAuthorization();
				if (this.canUse && (WIN.focused === this || this.popOutWindow?.document.hasFocus())) this.input.focus();
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

			this.chatBox.appendChild(group);
		}

		this.lastBubble = {
			group: group,
			bubble: bubble,
			sender: sender
		};

		const isScrolledToBottom = this.IsScrolledToBottom();

		group.appendChild(wrapper);

		if (isScrolledToBottom) {
			setTimeout(()=> wrapper.scrollIntoView({behavior:"smooth"}), 50);
		}

		return bubble;
	}

	CreateTextBubble(text, direction, sender, alias, color, time, id=null) {
		if (text.length === 0) return;

		const bubble = this.CreateBubble(direction, sender, alias, color, time);
		bubble.textContent = text;

		if (direction === "out") {
			if (id && !(id in this.outgoing)) {
				this.outgoing[id] = bubble;
			}
		}

		return bubble;
	}

}
