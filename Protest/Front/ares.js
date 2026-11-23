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
		this.reasoningPreferences = new Map();
		this.modelPreferences = new Map();

		if (this.args.agent && this.args.model) {
			this.reasoningPreferences.set(JSON.stringify([this.args.agent, this.args.model]), this.args.reasoning ?? "");
			this.modelPreferences.set(this.args.agent, this.args.model);
		}

		this.canUse = false;
		this.messages = [];
		this.historyLoading = false;
		this.historyDeleting = false;
		this.historyNeedsReload = false;
		this.historyController = null;
		this.historyListController = null;
		this.conversations = [];
		this.requests = new Map();
		this.conversationViews = new Map();
		this.pendingResponse = null;
		this.pendingController = null;
		this.pendingTimer = null;
		this.speech = null;
		this.speechSettings = {rate:1, volume:1};
		this.speechVoice = "";

		Window.AddCssDependencies("ares.css");
		Window.AddCssDependencies("list.css");

		this.SetTitle("A.R.E.S.");
		this.SetIcon("mono/ares.svg");

		this.InitializeComponents();
		this.UpdateAuthorization();

		if (this.canUse && this.args.conversationId) {
			this.OpenConversation(this.args.conversationId);
		}
	}

	Close() { //overrides
		this.StopSpeech();
		for (const request of this.requests.values()) {
			request.controller.abort();
		}

		this.settingsController?.abort();
		this.historyController?.abort();
		this.historyListController?.abort();
		this.StopHistoryPolling();
		this.layoutObserver?.disconnect();
		super.Close();
	}

	UpdateAuthorization() { //overrides
		super.UpdateAuthorization();

		const previouslyAllowed = this.canUse;
		this.canUse = KEEP.authorization.includes("*") || KEEP.authorization.includes("ares:write");

		if (!this.canUse) {
			for (const request of this.requests.values()) {
				request.controller.abort();
			}

			this.settingsController?.abort();
			this.modelCatalog = null;
			this.historyController?.abort();
			this.historyListController?.abort();
			this.StopHistoryPolling();
			this.conversations = [];

			if (this.historyList) {
				this.RenderHistoryList();
			}

			this.StopSpeech();
		}

		if (!this.input) return;

		this.UpdateSettingsControls();
		this.UpdateHistoryControls();

		if (!this.canUse) {
			this.SetSettingsError("A.R.E.S. access is required. Contact your administrator.");
		}
		else if (!previouslyAllowed && this.settingsInitialized) {
			this.LoadAgents();
			this.LoadHistoryList();

			if (this.pendingResponse) {
				this.ScheduleHistoryPoll();
			}
		}
	}

	InitializeComponents() {
		this.content.style.overflow = "hidden";

		this.content.classList.add("ares-layout");
		this.chatPane = this.content.ownerDocument.createElement("div");
		this.chatPane.className = "ares-chat";
		this.content.appendChild(this.chatPane);
		this.InitializeSidebar();

		this.chatBox = document.createElement("div");
		this.chatBox.className = "ares-box";
		this.chatPane.appendChild(this.chatBox);

		this.input = document.createElement("div");
		this.input.contentEditable = "true";
		this.input.setAttribute("role", "textbox");
		this.input.setAttribute("aria-label", "Ask A.R.E.S.");
		this.input.setAttribute("aria-multiline", "true");
		this.input.className = "ares-input";

		this.chatPane.appendChild(this.input);
		this.defaultElement = this.input;

		this.stopButton = this.content.ownerDocument.createElement("button");
		this.stopButton.type = "button";
		this.stopButton.className = "ares-stop";
		this.stopButton.setAttribute("aria-label", "Stop response");
		this.stopButton.title = "Stop response";
		this.stopButton.hidden = true;
		this.stopButton.onclick = ()=> this.StopResponse();
		this.chatPane.appendChild(this.stopButton);

		this.InitializeSettings();

		this.layoutObserver = new ResizeObserver(()=> this.LayoutComposer());
		this.layoutObserver.observe(this.content);
		this.layoutObserver.observe(this.input);
		this.layoutObserver.observe(this.settingsMenu);

		this.input.onkeydown = event=> this.Input_onkeydown(event);

		this.input.onpaste = event=> {
			event.preventDefault();
			const text = event.clipboardData?.getData("text/plain");
			if (text) {
				this.input.ownerDocument.execCommand("insertText", false, text);
			}
		};

		this.input.ondrop = event=> event.preventDefault();
	}

	InitializeSettings() {
		const doc = this.content.ownerDocument;
		this.settingsMenu = doc.createElement("div");
		this.settingsMenu.className = "ares-settings";

		this.settingsSummary = doc.createElement("div");
		this.settingsSummary.className = "ares-settings-summary";
		this.settingsSummary.tabIndex = 0;
		this.settingsSummary.setAttribute("role", "button");

		this.settingsPanel = doc.createElement("div");
		this.settingsPanel.className = "ares-settings-panel";
		this.settingsPanel.tabIndex = -1;
		this.settingsPanel.hidden = !!(this.args.agent && this.args.model);

		this.settingsSummary.setAttribute("aria-expanded", String(!this.settingsPanel.hidden));

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

		const reasoningSetting = doc.createElement("label");
		reasoningSetting.className = "ares-setting ares-reasoning-setting";
		const reasoningCaption = doc.createElement("span");
		reasoningCaption.textContent = "Reasoning";

		this.reasoningRange = doc.createElement("input");
		this.reasoningRange.type = "range";
		this.reasoningRange.min = "0";
		this.reasoningRange.step = "1";
		this.reasoningRange.setAttribute("aria-label", "Reasoning");

		this.reasoningSpinner = doc.createElement("span");
		this.reasoningSpinner.className = "task-spinner ares-reasoning-spinner";
		this.reasoningSpinner.setAttribute("role", "status");
		this.reasoningSpinner.setAttribute("aria-label", "Loading reasoning levels");
		this.reasoningSpinner.hidden = true;

		this.reasoningValue = doc.createElement("output");
		this.reasoningValue.style.fontWeight = "600";

		reasoningSetting.append(reasoningCaption, this.reasoningRange, this.reasoningSpinner, this.reasoningValue);
		this.settingsPanel.appendChild(reasoningSetting);

		this.settingsError = doc.createElement("div");
		this.settingsError.className = "ares-error";
		this.settingsError.setAttribute("role", "alert");
		this.settingsError.hidden = true;
		this.settingsPanel.appendChild(this.settingsError);

		this.settingsMenu.append(this.settingsSummary, this.settingsPanel);
		this.chatPane.appendChild(this.settingsMenu);

		this.agentSelect.onchange = ()=> this.LoadModels(this.agentSelect.value);
		this.modelSelect.onchange = ()=> this.SelectModel(this.modelSelect.value);
		this.reasoningRange.oninput = ()=> {
			this.UpdateReasoningLabel();
			if (!this.connection) return;

			const value = this.GetReasoningLevel();
			this.args.reasoning = value;
			this.reasoningPreferences.set(this.ConnectionKey(), value);
		};

		this.settingsMenu.addEventListener("focusout", event=> {
			if (!this.settingsMenu.contains(event.relatedTarget)) this.SetSettingsOpen(false);
		});

		this.settingsSummary.onclick = ()=> this.SetSettingsOpen(this.settingsPanel.hidden);
		this.settingsSummary.onkeydown = event=> {
			if (event.key !== "Enter" && event.key !== " ") return;
			event.preventDefault();
			if (!event.repeat) {
				this.settingsSummary.click();
			}
		};

		this.ConfigureReasoningLevels();
		this.settingsInitialized = true;

		if (!this.settingsPanel.hidden) {
			this.settingsSummary.focus({preventScroll:true});
		}
	}

	SetSettingsOpen(open) {
		if (this.settingsPanel.hidden === !open) return;
		this.settingsPanel.hidden = !open;
		this.settingsSummary.setAttribute("aria-expanded", String(open));

		if (open) {
			this.settingsSummary.focus({preventScroll:true});
		}

		this.LayoutComposer();

		if (open && !this.settingsController) this.LoadAgents();
	}

	LayoutComposer() {
		this.historyList.UpdateViewport();
		this.settingsPanel.style.maxHeight = `${Math.max(48, Math.min(240, this.content.clientHeight - 160))}px`;

		const height = this.settingsMenu.offsetHeight;
		this.input.style.bottom = `${height + 16}px`;
		this.stopButton.style.bottom = `${height + 24}px`;
		this.input.style.maxHeight = `${Math.max(60, this.content.clientHeight - height - 56)}px`;
		this.chatBox.style.bottom = `${height + this.input.offsetHeight + 24}px`;
	}

	ConnectionKey() { return JSON.stringify([this.connection.agent, this.connection.model]); }

	ConfigureReasoningLevels() {
		const levels = [...new Set(this.connection?.reasoning ?? [])];

		//Boolean thinking controls run from Off to On, regardless of discovery order.
		if (levels.every(value=> value === "false" || value === "true")) levels.sort();
		const values = ["", ...levels];
		if (!this.reasoningLevels || values.length !== this.reasoningLevels.length || values.some((value, index)=> value !== this.reasoningLevels[index])) {
			this.reasoningLevels = values;
		}

		const saved = this.connection ? this.reasoningPreferences.get(this.ConnectionKey()) ?? "" : "";
		const title = this.connection && !levels.length ? "No reasoning levels were provided for this model. The provider default is used." : "";
		if (this.reasoningValue.title !== title) this.reasoningValue.title = title;

		const max = String(this.reasoningLevels.length - 1);
		const value = String(Math.max(0, this.reasoningLevels.indexOf(saved)));
		if (this.reasoningRange.max !== max) this.reasoningRange.max = max;
		if (this.reasoningRange.value !== value) this.reasoningRange.value = value;

		this.UpdateReasoningLabel();
		this.UpdateSettingsControls();
	}

	GetReasoningLevel() {
		return this.reasoningLevels[Number(this.reasoningRange.value)] ?? "";
	}

	UpdateReasoningLabel() {
		const value = this.GetReasoningLevel();
		const names = {"":"Default", false:"Off", true:"On", xhigh:"Extra high"};
		const label = Object.hasOwn(names, value) ? names[value] : value.charAt(0).toUpperCase() + value.slice(1);

		if (this.reasoningValue.textContent !== label) {
			this.reasoningValue.textContent = label;
		}

		if (this.reasoningRange.getAttribute("aria-valuetext") !== label) this.reasoningRange.setAttribute("aria-valuetext", label);
		const model = this.connection?.modelName ?? this.connection?.model;
		const summary = model ? `${model} · ${label}` : "Select model";

		if (this.settingsSummary.textContent !== summary) {
			this.settingsSummary.textContent = summary;
		}
	}

	UpdateSettingsControls() {
		const disabled = !this.canUse || this.settingsBusy;
		if (disabled && this.settingsPanel.contains(this.content.ownerDocument.activeElement)) {
			this.settingsSummary.focus({preventScroll:true});
		}

		for (const [control, value] of [
			[this.agentSelect, disabled || this.agents.length === 0],
			[this.modelSelect, disabled || !this.modelCatalog || this.modelCatalog.agent.id !== this.agentSelect.value],
			[this.reasoningRange, disabled || !this.connection || this.reasoningLevels.length <= 1]
		]) {
			if (control.disabled !== value) control.disabled = value;
		}

		if (this.reasoningSpinner.hidden !== !this.settingsBusy) this.reasoningSpinner.hidden = !this.settingsBusy;
		const busy = String(this.settingsBusy);
		if (this.settingsMenu.getAttribute("aria-busy") !== busy) this.settingsMenu.setAttribute("aria-busy", busy);
	}

	SetSettingsError(text = "") {
		if (this.settingsError.textContent !== text) this.settingsError.textContent = text;
		if (this.settingsError.hidden !== !text) this.settingsError.hidden = !text;
	}

	BeginSettingsRequest(busy) {
		this.settingsController?.abort();
		const controller = new AbortController();
		this.settingsController = controller;
		this.settingsBusy = busy;
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

		const controller = this.BeginSettingsRequest(agentId !== null || !this.connection || !this.modelCatalog?.reasoningLoaded);
		const ReadOptions = async url=> {
			const response = await fetch(url, {signal:controller.signal, cache:"no-store"});
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const result = await response.json();
			if (!this.IsCurrentSettings(controller)) {
				throw new Error("The request was canceled.");
			}

			if (result.error) {
				throw new Error(result.error);
			}

			return result;
		};

		const SetOptions = (select, entries, label, value)=> {
			if (select.options.length !== entries.length || entries.some((entry, index)=> entry.id !== select.options[index].value || label(entry) !== select.options[index].text)) {
				select.replaceChildren(...entries.map(entry=> new Option(label(entry), entry.id)));
			}
			if (select.value !== value) select.value = value;
		};

		try {
			const agents = agentId === null ? await ReadOptions("ares/agents") : this.agents;
			const requestedAgent = agentId ?? this.args.agent;
			const agent = requestedAgent ? agents.find(entry=> entry.id === requestedAgent) : agents[0];
			this.agents = agents;
			SetOptions(this.agentSelect, agents, entry=> `${entry.name} (${entry.label})`, agent?.id ?? "");
			if (!agent || this.modelCatalog?.agent.id !== agent.id) {
				this.modelCatalog = null;
				if (this.modelSelect.options.length) this.modelSelect.replaceChildren();
			}
			if (!agents.length) {
				throw new Error("No enabled agents. Add an agent in Infrastructure → A.R.E.S., then reopen this menu.");
			}

			if (!agent) throw new Error("The selected agent is no longer available. Choose an enabled agent.");

			const preferred = this.modelPreferences.get(agent.id) ?? (this.args.agent === agent.id ? this.args.model : null);
			const reuseOptions = agentId === null && this.modelCatalog?.reasoningLoaded && this.connection?.agent === agent.id &&
				this.connection.model === preferred && this.connection.revision === agent.revision;
			let current = this.modelCatalog;
			if (reuseOptions) {
				modelId = preferred;
			}
			else {
				if (!this.settingsBusy) {
					this.settingsBusy = true;
					this.UpdateSettingsControls();
				}
				const url = `ares/models?id=${encodeURIComponent(agent.id)}`;
				const catalog = modelId !== null && this.modelCatalog?.agent.id === agent.id && this.modelCatalog.revision === agent.revision ? this.modelCatalog : await ReadOptions(url);
				if (catalog.agent.id !== agent.id || catalog.agent.name !== agent.name || catalog.agent.type !== agent.type ||
					(agent.revision && catalog.revision !== agent.revision)) throw new Error("The agent settings changed. Close and reopen this menu to refresh the options.");
				if (!catalog.models.length) throw new Error("No models are available for this agent.");

				modelId ??= preferred ?? catalog.models[0].id;
				current = catalog.models.some(model=> model.id === modelId) ? await ReadOptions(`${url}&model=${encodeURIComponent(modelId)}`) : catalog;
				if (current.revision !== catalog.revision || current.agent.id !== catalog.agent.id) throw new Error("The agent settings changed. Close and reopen this menu to refresh the options.");
			}

			const model = current.models.find(entry=> entry.id === modelId);
			if (!reuseOptions) {
				SetOptions(this.modelSelect, current.models, entry=> entry.name === entry.id ? entry.id : `${entry.name} (${entry.id})`, model?.id ?? "");
				this.modelCatalog = current;
				if (!model) throw new Error("The selected model is no longer available. Choose another model.");
				this.connection = Object.freeze({
					agent:current.agent.id, agentName:current.agent.name, provider:current.agent.type,
					model:model.id, modelName:model.name, revision:current.revision,
					reasoning:Object.freeze(current.reasoning ?? [])
				});
			}

			this.args.agent = this.connection.agent;
			this.args.model = this.connection.model;
			this.modelPreferences.set(this.connection.agent, this.connection.model);
			this.ConfigureReasoningLevels();
			this.args.reasoning = this.GetReasoningLevel();
		}
		catch (ex) {
			if (this.IsCurrentSettings(controller)) {
				this.connection = null;
				this.ConfigureReasoningLevels();
				this.SetSettingsError(ex.message ?? String(ex));
			}
		}
		finally { this.FinishSettingsRequest(controller); }
	}

	InitializeSidebar() {
		const doc = this.content.ownerDocument;
		this.sidebarOpen = typeof this.args.sidebarOpen === "boolean" ? this.args.sidebarOpen : true;
		this.sidebar = doc.createElement("nav");
		this.sidebar.className = "ares-sidebar";
		this.sidebar.id = `ares-sidebar-${UI.GenerateUuid()}`;
		this.sidebar.setAttribute("aria-label", "Conversations");

		const heading = doc.createElement("div");
		heading.className = "ares-sidebar-heading";
		heading.textContent = "Conversations";

		this.newConversationButton = doc.createElement("button");
		this.newConversationButton.type = "button";
		this.newConversationButton.className = "with-icon ares-new-chat";
		this.newConversationButton.style.backgroundImage = "url(mono/add.svg?light)";
		this.newConversationButton.textContent = "New chat";
		this.newConversationButton.onclick = ()=> this.NewConversation();
		this.sidebar.append(heading, this.newConversationButton);

		this.historyList = new ListBox({onSelect: (id, element)=> {
			if (!this.canUse || this.historyDeleting) return;
			const saved = element._data;
			if (saved.id !== this.args.conversationId || saved.revision !== this.args.conversationRevision || this.historyNeedsReload || this.historyController) {
				this.OpenConversation(saved.id);
			}
			else {
				this.UpdateHistoryControls();
			}
		}});

		this.historyList.list.classList.add("ares-history-list");
		this.historyList.list.classList.remove("no-results");
		this.historyList.list.setAttribute("aria-label", "Your saved conversations");
		this.historyList.list.addEventListener("keydown", event=> {
			if (event.target === this.historyList.list && this.canUse && !this.historyDeleting) {
				this.historyList.Keydown(event);
			}
		});

		this.historyList.inflate = (element, entry)=> {
			const label = element.ownerDocument.createElement("div");
			label.className = "ares-conversation-title";
			label.textContent = entry.title;

			const remove = element.ownerDocument.createElement("span");
			remove.className = "ares-conversation-remove";
			remove.setAttribute("role", "button");
			remove.setAttribute("aria-label", `Remove conversation: ${entry.title}`);
			remove.setAttribute("aria-disabled", String(!this.canUse || this.historyLoading || this.IsConversationPending(entry.id)));

			element.append(label, remove);

			remove.onclick = event=> {
				event.stopPropagation();
				this.DeleteConversation(entry.id);
			};

			remove.ondblclick = event=> event.stopPropagation();

			element.onclick = ()=> {
				if (this.canUse && !this.historyDeleting) {
					this.historyList.Select(element);
				}
			};
			element.ondblclick = element.onclick;
		};

		this.historyEmpty = doc.createElement("div");
		this.historyEmpty.className = "ares-history-empty";
		this.historyEmpty.textContent = "No saved conversations.";
		this.historyEmpty.hidden = true;
		this.historyError = doc.createElement("div");
		this.historyError.className = "ares-error";
		this.historyError.setAttribute("role", "alert");
		this.historyError.hidden = true;
		this.sidebar.append(this.historyList.list, this.historyEmpty, this.historyError);

		this.sidebarToggle = doc.createElement("button");
		this.sidebarToggle.type = "button";
		this.sidebarToggle.className = "ares-sidebar-toggle";
		this.sidebarToggle.setAttribute("aria-controls", this.sidebar.id);
		this.content.append(this.sidebar, this.sidebarToggle);

		this.sidebarToggle.onclick = ()=> this.SetSidebarOpen(!this.sidebarOpen);

		this.UpdateSidebarLayout();
	}

	UpdateSidebarLayout() {
		this.content.classList.toggle("ares-sidebar-open", this.sidebarOpen);
		this.sidebar.inert = !this.sidebarOpen;
		this.sidebar.setAttribute("aria-hidden", String(!this.sidebarOpen));
		this.sidebarToggle.setAttribute("aria-expanded", String(this.sidebarOpen));
	}

	SetSidebarOpen(open) {
		if (this.isClosed) return;
		this.sidebarOpen = !!open;
		this.args.sidebarOpen = this.sidebarOpen;

		const hadFocus = this.sidebar.contains(this.content.ownerDocument.activeElement);
		this.UpdateSidebarLayout();

		if (this.sidebarOpen) {
			this.historyList.UpdateViewport();
			this.LoadHistoryList();
		}
		else if (hadFocus) {
			this.sidebarToggle.focus({preventScroll:true});
		}
	}

	RenderHistoryList() {
		const scroll = this.historyList.list.scrollTop;
		if (this.historyList.list.contains(this.content.ownerDocument.activeElement)) {
			this.historyList.list.focus({preventScroll:true});
		}

		this.historyList.SetItems(this.conversations);
		this.historyList.list.scrollTop = scroll;
		this.historyEmpty.hidden = this.conversations.length > 0;
		this.UpdateHistoryControls();
	}

	async LoadHistoryList() {
		if (!this.canUse || this.isClosed) return;
		this.historyListController?.abort();

		const controller = new AbortController();
		this.historyListController = controller;
		this.historyList.list.setAttribute("aria-busy", "true");
		this.historyError.hidden = true;

		try {
			const response = await fetch("ares/history/list", {signal:controller.signal});
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const saved = await response.json();
			if (saved.error) throw new Error(saved.error);
			if (!Array.isArray(saved)) throw new Error("The server returned invalid conversation history.");

			if (controller.signal.aborted || this.isClosed || !this.canUse) return;

			const changed = saved.length !== this.conversations.length || saved.some((entry, index)=> {
				const old = this.conversations[index];
				return entry.id !== old.id || entry.title !== old.title || entry.updatedAt !== old.updatedAt || entry.revision !== old.revision || entry.pending !== old.pending;
			});

			this.conversations = saved;
			if (changed) {
				this.RenderHistoryList();
			}
			else {
				this.historyEmpty.hidden = saved.length > 0;
			}
		}
		catch (ex) {
			if (!controller.signal.aborted && !this.isClosed && this.canUse) {
				this.historyError.textContent = ex.message ?? String(ex);
				this.historyError.hidden = false;
				this.historyEmpty.hidden = true;
			}
		}
		finally {
			if (this.historyListController === controller) {
				this.historyListController = null;
				this.historyList.list.removeAttribute("aria-busy");
			}
		}
	}

	UpdateHistoryControls() {
		this.UpdateStopButton();
		const disabled = !this.canUse || this.historyDeleting;
		this.newConversationButton.disabled = disabled;
		this.sidebarToggle.disabled = !this.canUse;
		this.historyList.list.setAttribute("aria-disabled", String(disabled));
		this.historyList.selected = null;

		for (const button of this.chatBox.querySelectorAll(".ares-response-branch")) {
			button.disabled = !this.canUse || this.historyLoading;
		}

		for (const element of this.historyList.list.children) {
			const current = element._data.id === this.args.conversationId;
			element.classList.toggle("ares-current-conversation", current);

			if (current) {
				element.setAttribute("aria-current", "page");
			}
			else {
				element.removeAttribute("aria-current");
			}

			element.style.backgroundColor = "";
			if (current) this.historyList.selected = element;

			const pending = this.IsConversationPending(element._data.id);
			element.classList.toggle("ares-conversation-pending", pending);
			element.setAttribute("aria-busy", String(pending));

			const remove = element.querySelector(".ares-conversation-remove");
			if (remove) remove.setAttribute("aria-disabled", String(disabled || this.historyLoading || pending));
		}
	}

	NewConversation() {
		if (this.isClosed || !this.canUse || this.historyDeleting) return;

		this.SaveConversationView();

		this.historyController?.abort();
		this.historyController = null;
		this.historyLoading = false;

		this.StopHistoryPolling();
		this.pendingResponse = null;

		this.StopSpeech();
		this.chatBox.replaceChildren();
		this.chatBox.removeAttribute("aria-busy");

		this.messages = [];
		this.lastBubble = null;
		this.historyNeedsReload = false;

		delete this.args.conversationId;
		delete this.args.conversationRevision;

		this.SetTitle("A.R.E.S.");
		this.RestoreConversationView(null);
		this.UpdateHistoryControls();

		this.input.focus({preventScroll:true});
	}

	SaveConversationView() {
		this.conversationViews.set(this.args.conversationId ?? null, {
			draft:this.input.innerHTML, scroll:this.chatBox.scrollTop, follow:this.IsScrolledToBottom()
		});
	}

	RestoreConversationView(id) {
		const view = this.conversationViews.get(id);
		this.input.innerHTML = view?.draft ?? "";
		this.chatBox.scrollTop = !view || view.follow ? this.chatBox.scrollHeight : view.scroll;
	}

	IsConversationPending(id) {
		return this.requests.has(id) || (id === this.args.conversationId && !!this.pendingResponse) || !!this.conversations.find(entry=> entry.id === id)?.pending;
	}

	IsThinking() { return this.requests.has(this.args.conversationId) || !!this.pendingResponse; }

	UpdateStopButton() {
		const pending = this.pendingResponse;
		const request = this.requests.get(this.args.conversationId);
		this.stopButton.hidden = !this.canUse || !pending?.requestId || (request?.requestId === pending.requestId && !request.accepted);
		this.stopButton.disabled = !!pending?.stopping;
	}

	async StopResponse() {
		const pending = this.pendingResponse;
		const id = this.args.conversationId;
		if (this.isClosed || !this.canUse || !pending || this.stopButton.hidden || pending.stopping) return;

		pending.stopping = true;
		this.UpdateStopButton();

		try {
			const response = await fetch(`ares/history/stop?id=${encodeURIComponent(id)}&requestId=${encodeURIComponent(pending.requestId)}`, {method:"POST"});
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
			const result = await response.json();
			if (result.error) throw new Error(result.error);
			if (this.pendingResponse === pending && this.args.conversationId === id) this.PollConversation();
		}
		catch (ex) {
			if (!this.isClosed && this.canUse && this.pendingResponse === pending) {
				this.ConfirmBox(`Unable to stop response: ${ex.message ?? ex}`, true, "mono/error.svg");
			}
		}
		finally {
			pending.stopping = false;
			if (!this.isClosed) this.UpdateStopButton();
		}
	}

	StopHistoryPolling() {
		clearTimeout(this.pendingTimer);
		this.pendingTimer = null;
		this.pendingController?.abort();
		this.pendingController = null;
	}

	ScheduleHistoryPoll() {
		if (this.isClosed || !this.canUse || !this.pendingResponse || this.requests.has(this.args.conversationId)) return;
		clearTimeout(this.pendingTimer);
		this.pendingTimer = setTimeout(()=> this.PollConversation(), 1500);
	}

	async PollConversation() {
		if (this.isClosed || !this.canUse || !this.pendingResponse || this.pendingController || this.requests.has(this.args.conversationId)) return;
		clearTimeout(this.pendingTimer);
		this.pendingTimer = null;

		const id = this.args.conversationId;
		const pending = this.pendingResponse;
		const controller = new AbortController();

		this.pendingController = controller;

		let timedOut = false;
		const timeout = setTimeout(()=> {
			timedOut = true;
			controller.abort();
		}, 10000);

		try {
			const response = await fetch(`ares/history/get?id=${encodeURIComponent(id)}`, {signal:controller.signal, cache:"no-store"});

			if (response.status !== 200) {
				LOADER.HttpErrorHandler(response.status);
			}

			const saved = await response.json();
			if (controller.signal.aborted || this.isClosed || !this.canUse || this.args.conversationId !== id || this.pendingResponse !== pending) return;

			if (saved.error === "not found") {
				this.PendingResponseFailed("This conversation is no longer available. Start a new chat to continue.");
				return;
			}

			if (saved.error) throw new Error(saved.error);

			pending.bubble.querySelector(".ares-pending-error")?.remove();
			if (!saved.pending && saved.revision <= this.args.conversationRevision) {
				this.PendingResponseFailed("The response ended but could not be saved. Reopen the conversation or start a new chat to continue.");
				return;
			}

			if (saved.revision !== this.args.conversationRevision || saved.pending?.requestId !== pending.requestId) {
				this.RestoreConversation(saved, this.IsScrolledToBottom());
				this.LoadHistoryList();
			}
			else if (saved.pending) {
				this.RenderPendingReasoning(saved.pending.reasoningText ?? "");
				this.RenderPendingResponse(saved.pending.response ?? "");
			}
		}
		catch (ex) {
			if ((!controller.signal.aborted || timedOut) && this.pendingController === controller && !this.isClosed && this.canUse && this.pendingResponse === pending) {
				let error = pending.bubble.querySelector(".ares-pending-error");
				if (!error) {
					error = pending.bubble.ownerDocument.createElement("div");
					error.className = "ares-error ares-pending-error";
					error.setAttribute("role", "alert");
					pending.bubble.appendChild(error);
				}

				error.textContent = `${timedOut ? "Checking the response timed out." : ex.message ?? ex} Retrying…`;
			}
		}
		finally {
			clearTimeout(timeout);
			if (this.pendingController === controller) {
				this.pendingController = null;
				this.ScheduleHistoryPoll();
			}
		}
	}

	RenderReasoning(response, text) {
		let section = response.querySelector(":scope > .ares-reasoning");
		if (!text) {
			section?.remove();
			return;
		}

		const follow = this.IsScrolledToBottom();
		if (!section) {
			const doc = response.ownerDocument;
			section = doc.createElement("details");
			section.className = "ares-reasoning";

			const summary = doc.createElement("summary");
			summary.textContent = "Reasoning";

			const content = doc.createElement("div");
			content.className = "ares-reasoning-text";
			section.append(summary, content);

			const incoming = response.querySelector(":scope > .in");
			const thinking = incoming.querySelector(":scope > .ares-thinking");
			if (thinking) {
				Ares.RenderMarkdown(thinking, "Reasoning...");
				incoming.after(section);
			}
			else {
				incoming.before(section);
			}
		}

		const content = section.querySelector(".ares-reasoning-text");
		if (content._markdownText === text) return;
		const followReasoning = content.scrollTop + content.clientHeight >= content.scrollHeight - 32;
		Ares.RenderMarkdown(content, text);
		if (followReasoning) content.scrollTop = content.scrollHeight;
		if (follow && !this.restoringHistory) this.chatBox.scrollTop = this.chatBox.scrollHeight;
	}

	RenderPendingReasoning(text) {
		const pending = this.pendingResponse;
		if (!pending || !text || text.length < (pending.reasoningText?.length ?? 0)) return;
		pending.reasoningText = text;
		this.RenderReasoning(pending.bubble.closest(".ares-response"), text);
	}

	RenderPendingResponse(text) {
		const pending = this.pendingResponse;
		if (!pending || !text || text.length < (pending.response?.length ?? 0)) return;
		pending.response = text;

		const reply = pending.bubble;
		const thinking = reply.classList.contains("ares-thinking");
		if (reply._markdownText === text && !thinking) return;

		const follow = this.IsScrolledToBottom();
		const response = reply.closest(".ares-response");
		if (thinking) {
			reply.classList.remove("ares-thinking");
			const incoming = reply.parentElement;
			const focused = incoming === incoming.ownerDocument.activeElement;
			response.querySelector(":scope > .ares-reasoning")?.after(incoming);
			if (focused) incoming.focus({preventScroll:true});
		}

		Ares.RenderMarkdown(reply, text);
		this.UpdateResponseButtons(response);
		if (follow) this.chatBox.scrollTop = this.chatBox.scrollHeight;
	}

	CompletePendingResponse(text = null) {
		const reply = this.pendingResponse.bubble;
		const response = reply.closest(".ares-response");
		const follow = this.IsScrolledToBottom();
		reply.classList.remove("ares-thinking");
		reply.removeAttribute("aria-busy");
		reply.removeAttribute("role");

		if (text !== null) {
			this.RenderReasoning(response, "");
			const error = reply.ownerDocument.createElement("div");
			error.className = "ares-error";
			error.setAttribute("role", "alert");
			error.textContent = text;
			reply.replaceChildren(error);
			reply._markdownText = "";
		}
		else {
			response._branchRequestId = this.pendingResponse.requestId;
		}

		this.pendingResponse = null;
		this.chatBox.removeAttribute("aria-busy");
		this.UpdateResponseButtons(response);

		if (follow) this.chatBox.scrollTop = this.chatBox.scrollHeight;

		this.UpdateHistoryControls();
	}

	PendingResponseFailed(text) {
		this.historyNeedsReload = true;
		this.CompletePendingResponse(text);
		this.LoadHistoryList();
	}

	RestoreConversation(saved, follow = true) {
		const scroll = this.chatBox.scrollTop;

		this.StopSpeech();
		this.chatBox.replaceChildren();
		this.lastBubble = null;
		this.messages = [];
		this.restoringHistory = true;

		try {
			for (const message of saved.messages) {
				const time = new Date(message.time).toLocaleTimeString(UI.regionalFormat, {});
				const incoming = message.role === "assistant";
				const bubble = this.CreateTextBubble(message.content, incoming ? "in" : "out", incoming ? `ares:${message.agent}` : KEEP.username,
					incoming ? `${message.agentName} · ${message.model}` : "", incoming ? "var(--clr-accent)" : KEEP.color, time,
					incoming && message.status === "completed" ? message.requestId : null);
				if (incoming && message.reasoningText) this.RenderReasoning(bubble.closest(".ares-response"), message.reasoningText);

				if (message.status === "interrupted") {
					const reply = this.CreateBubble("in", `ares:${message.agent}`, `${message.agentName} · ${message.model}`, "var(--clr-accent)", time);

					const error = reply.ownerDocument.createElement("div");
					error.className = "ares-error";
					error.textContent = message.error ?? "The response was interrupted. Your message was saved.";
					error.setAttribute("role", "alert");
					reply.appendChild(error);
					this.UpdateResponseButtons(reply.closest(".ares-response"));
				}
				else {
					this.messages.push({role:message.role, content:message.content});
				}
			}

			this.pendingResponse = saved.pending ?? null;

			if (this.pendingResponse) {
				const pending = this.pendingResponse;
				const time = new Date(pending.time).toLocaleTimeString(UI.regionalFormat, {});
				this.CreateTextBubble(pending.text, "out", KEEP.username, "", KEEP.color, time);

				const reply = this.CreateThinkingBubble(pending.agent, pending.agentName, pending.model, time);
				this.pendingResponse = {...pending, bubble:reply};
				this.chatBox.setAttribute("aria-busy", "true");

				const request = this.requests.get(saved.id);
				const text = request?.requestId === pending.requestId && request.responseText.length > (pending.response?.length ?? 0) ? request.responseText : pending.response;
				const reasoningText = request?.requestId === pending.requestId && request.reasoningText.length > (pending.reasoningText?.length ?? 0) ? request.reasoningText : pending.reasoningText;
				this.RenderPendingReasoning(reasoningText ?? "");
				this.RenderPendingResponse(text ?? "");
			}
			else {
				this.chatBox.removeAttribute("aria-busy");
			}
		}
		finally {
			this.restoringHistory = false;
		}

		this.args.conversationId = saved.id;
		this.args.conversationRevision = saved.revision;
		this.historyNeedsReload = false;

		this.SetTitle(`A.R.E.S. - ${saved.title}`);
		this.chatBox.scrollTop = follow ? this.chatBox.scrollHeight : scroll;
		this.UpdateHistoryControls();
	}

	async OpenConversation(id) {
		if (!this.canUse || this.isClosed || this.historyDeleting) return false;
		this.historyController?.abort();

		const controller = new AbortController();
		this.historyController = controller;
		this.historyLoading = true;
		this.UpdateHistoryControls();

		try {
			const response = await fetch(`ares/history/get?id=${encodeURIComponent(id)}`, {signal:controller.signal, cache:"no-store"});
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const saved = await response.json();
			if (saved.error) throw new Error(saved.error);
			if (controller.signal.aborted || this.historyController !== controller || this.isClosed || !this.canUse) return false;

			this.SaveConversationView();
			this.StopHistoryPolling();
			this.RestoreConversation(saved);
			this.RestoreConversationView(saved.id);

			if (this.pendingResponse) this.ScheduleHistoryPoll();

			const last = saved.pending ?? saved.messages.findLast(message=> message.agent);
			if (last) {
				this.args.agent = last.agent;
				this.args.model = last.model;
				this.reasoningPreferences.set(JSON.stringify([last.agent, last.model]), last.reasoning ?? "");
				this.modelPreferences.set(last.agent, last.model);
				await this.LoadAgents();
			}

			return true;
		}
		catch (ex) {
			if (!controller.signal.aborted && !this.isClosed) {
				if (id === this.args.conversationId) this.historyNeedsReload = true;
				this.ConfirmBox(`Unable to open conversation: ${ex.message ?? ex}. Start a new conversation if it was deleted by retention.`, true, "mono/error.svg");
			}
			return false;
		}
		finally {
			if (this.historyController === controller) {
				this.historyLoading = false;
				this.historyController = null;
				this.UpdateHistoryControls();
			}
		}
	}

	async BranchConversation(requestId) {
		const id = this.args.conversationId;
		if (this.isClosed || !this.canUse || this.historyLoading || !id || !requestId) return;

		const controller = new AbortController();
		this.historyController = controller;
		this.historyLoading = true;
		this.UpdateHistoryControls();

		try {
			const response = await fetch(`ares/history/branch?id=${encodeURIComponent(id)}&requestId=${encodeURIComponent(requestId)}`, {
				method: "POST",
				signal: controller.signal
			});
			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			const result = await response.json();
			if (result.error) throw new Error(result.error);
			if (controller.signal.aborted || this.isClosed || !this.canUse) return;

			this.LoadHistoryList();
			await this.OpenConversation(result.id);
		}
		catch (ex) {
			if (!controller.signal.aborted && !this.isClosed && this.canUse) {
				this.ConfirmBox(`Unable to branch conversation: ${ex.message ?? ex}`, true, "mono/error.svg");
			}
		}
		finally {
			if (this.historyController === controller) {
				this.historyController = null;
				this.historyLoading = false;
				this.UpdateHistoryControls();
			}
		}
	}

	DeleteConversation(id) {
		if (this.isClosed || !this.canUse || this.historyLoading || this.IsConversationPending(id) || !id) return;

		const saved = this.conversations.find(entry=> entry.id === id);
		this.ConfirmBox(saved ? `Delete conversation "${saved.title}" permanently?` : "Delete this conversation permanently?", false, "mono/delete.svg")?.addEventListener("click", async ()=> {
			if (this.isClosed || !this.canUse || this.historyLoading || this.IsConversationPending(id)) return;
			this.historyLoading = true;
			this.historyDeleting = true;

			this.UpdateHistoryControls();

			try {
				const response = await fetch(`ares/history/delete?id=${encodeURIComponent(id)}`, {method:"POST"});
				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

				const result = await response.json();
				if (result.error) throw new Error(result.error);
				if (this.isClosed) return;

				this.conversations = this.conversations.filter(entry=> entry.id !== id);
				this.RenderHistoryList();
				await this.LoadHistoryList();

				this.historyLoading = false;

				this.historyDeleting = false;
				if (this.args.conversationId === id) {
					this.NewConversation();
				}

				this.conversationViews.delete(id);
			}
			catch (ex) {
				if (!this.isClosed) this.ConfirmBox(ex.message ?? ex, true, "mono/error.svg");
			}
			finally {
				this.historyLoading = false;
				this.historyDeleting = false;
				if (!this.isClosed) this.UpdateHistoryControls();
			}
		});
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
		if (this.isClosed || !this.canUse || !this.connection || this.settingsBusy || this.historyLoading || this.IsThinking()) return;

		if (this.historyNeedsReload) {
			this.ConfirmBox("Reopen this conversation from the side menu or start a new chat before continuing.", true, "mono/error.svg");
			return;
		}

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
		if (!this.args.conversationId) this.conversationViews.delete(null);
		this.args.conversationId ??= UI.GenerateUuid();
		this.args.conversationRevision ??= 0;

		const conversationId = this.args.conversationId;
		const conversationRevision = this.args.conversationRevision;
		const reasoning = this.GetReasoningLevel();
		const requestId = UI.GenerateUuid();
		const controller = new AbortController();
		const request = {controller, requestId, responseText:"", reasoningText:"", accepted:false};
		this.requests.set(conversationId, request);
		this.UpdateHistoryControls();
		this.chatBox.setAttribute("aria-busy", "true");

		const messages = [...this.messages, {role:"user", content:text}];
		const now = Date.now();
		const nowString = new Date(now).toLocaleTimeString(UI.regionalFormat, {});
		const bubble = this.CreateTextBubble(text, "out", KEEP.username, "", KEEP.color, nowString);
		bubble.style.color = "var(--clr-pane)";
		bubble.style.backgroundColor = "transparent";
		bubble.style.boxShadow = "var(--clr-pane) 0 0 0 2px inset";

		const reply = this.CreateThinkingBubble(connection.agent, connection.agentName, connection.modelName, nowString);
		this.pendingResponse = {requestId, text, time:now, agent:connection.agent, agentName:connection.agentName, model:connection.model, reasoning, response:"", reasoningText:"", bubble:reply};
		this.ClearInput();

		let terminal = false;
		let recovering = false;
		let renderFrame = null;
		const IsVisible = ()=> this.args.conversationId === conversationId && this.pendingResponse?.requestId === requestId;
		const RenderReply = ()=> {
			if (renderFrame !== null) cancelAnimationFrame(renderFrame);
			renderFrame = null;
			if (!this.isClosed && IsVisible()) {
				this.RenderPendingReasoning(request.reasoningText);
				this.RenderPendingResponse(request.responseText);
			}
		};

		try {
			const response = await fetch(`ares/chat?id=${encodeURIComponent(connection.agent)}`, {
				method: "POST",
				headers: {"Content-Type":"application/json"},
				body: JSON.stringify({model:connection.model, revision:connection.revision, text, conversationId, conversationRevision, requestId, reasoning:reasoning || undefined}),
				signal: controller.signal
			});

			if (response.status !== 200) LOADER.HttpErrorHandler(response.status);

			if (!response.headers.get("Content-Type")?.startsWith("application/x-ndjson")) {
				const result = await response.json();
				throw new Error(result.error ?? "The agent returned an invalid response.");
			}

			let completed = false;
			await Ares.ReadChatStream(response, event=> {
				if (this.isClosed || controller.signal.aborted) throw new Error("The request was canceled.");
				if (completed) throw new Error("The agent returned an invalid response.");

				if (["accepted", "done", "error"].includes(event.type) && event.conversationId === conversationId && Number.isInteger(event.conversationRevision) && IsVisible()) {
					this.args.conversationRevision = event.conversationRevision;
				}

				if (event.type === "error") {
					terminal = true;
					if (IsVisible()) this.historyNeedsReload = event.historySaved === false;
					if (event.refreshOptions && this.connection === connection && this.modelCatalog) this.modelCatalog.reasoningLoaded = false;
					throw new Error(event.error ?? "Unable to get a response from this agent.");
				}

				if (event.type === "accepted" && !request.accepted) {
					request.accepted = true;
					if (IsVisible()) this.UpdateStopButton();
					bubble.style.color = "var(--clr-dark)";
					bubble.style.backgroundColor = "var(--clr-pane)";
					bubble.style.boxShadow = "none";
					this.LoadHistoryList();
				}
				else if (event.type === "reasoning" && request.accepted && typeof event.text === "string") {
					request.reasoningText += event.text;
					if (IsVisible() && renderFrame === null) renderFrame = requestAnimationFrame(RenderReply);
				}
				else if (event.type === "delta" && request.accepted && typeof event.text === "string") {
					request.responseText += event.text;
					if (IsVisible() && renderFrame === null) renderFrame = requestAnimationFrame(RenderReply);
				}
				else if (event.type === "done" && request.accepted && request.responseText.trim().length > 0) {
					RenderReply();
					completed = true;
					terminal = true;
				}
				else {
					throw new Error("The agent returned an invalid or empty text response.");
				}
			});

			if (!completed) throw new Error("The response was interrupted. Try again.");

			if (IsVisible()) {
				this.messages = [...messages, {role:"assistant", content:request.responseText}];
				this.CompletePendingResponse();
			}
		}
		catch (ex) {
			if (this.isClosed) return;

			recovering = request.accepted && !terminal && !controller.signal.aborted;
			if (IsVisible() && !recovering) {
				const error = controller.signal.aborted ? "A.R.E.S. access is required. Contact your administrator." : ex.message ?? String(ex);
				this.CompletePendingResponse(error);
			}
		}
		finally {
			if (renderFrame !== null) {
				cancelAnimationFrame(renderFrame);
			}

			if (this.requests.get(conversationId) === request) {
				this.requests.delete(conversationId);
			}

			if (!this.isClosed) {
				this.UpdateHistoryControls();
				if (this.canUse) {
					this.LoadHistoryList();
				}

				if (recovering && IsVisible()) {
					this.ScheduleHistoryPoll();
				}
			}
		}
	}

	CreateThinkingBubble(agent, agentName, model, time) {
		const reply = this.CreateTextBubble("Thinking...", "in", `ares:${agent}`, `${agentName} · ${model}`, "var(--clr-accent)", time);
		reply.classList.add("ares-thinking");
		reply.setAttribute("role", "status");
		reply.setAttribute("aria-busy", "true");

		this.UpdateResponseButtons(reply.closest(".ares-response"));
		return reply;
	}

	AddResponseButtons(response) {
		const readButton = response.ownerDocument.createElement("button");
		readButton.type = "button";
		readButton.className = "ares-speak";
		readButton.setAttribute("aria-pressed", "false");
		readButton.setAttribute("aria-label", "Read response aloud");
		readButton.title = "Read aloud";
		readButton.hidden = true;

		const copyButton = response.ownerDocument.createElement("button");
		copyButton.type = "button";
		copyButton.className = "ares-response-copy";
		copyButton.hidden = true;

		const branchButton = response.ownerDocument.createElement("button");
		branchButton.type = "button";
		branchButton.className = "ares-response-branch";
		branchButton.title = "Branch";
		branchButton.setAttribute("aria-label", "Branch conversation from this reply");
		branchButton.hidden = true;
		branchButton.onclick = ()=> this.BranchConversation(response._branchRequestId);

		let resetTimer = null;

		const ResetFeedback = ()=> {
			clearTimeout(resetTimer);
			resetTimer = null;
			copyButton.classList.remove("ares-copied");
			copyButton.setAttribute("aria-label", "Copy");
			copyButton.title = "Copy";
		};

		ResetFeedback();

		readButton.onclick = ()=> this.StartSpeech(response);

		copyButton.onclick = async ()=> {
			if (copyButton.hidden || copyButton.disabled) return;

			ResetFeedback();
			response.querySelector(":scope > .ares-response-copy-error")?.remove();
			copyButton.disabled = true;

			try {
				await Ares.CopyText(Ares.GetResponseText(response), response.ownerDocument);
				copyButton.classList.add("ares-copied");
				copyButton.setAttribute("aria-label", "Response copied");
				copyButton.title = "Response copied";
				resetTimer = setTimeout(ResetFeedback, 2000);
			}
			catch {
				const error = response.ownerDocument.createElement("div");
				error.className = "ares-error ares-response-copy-error";
				error.setAttribute("role", "alert");
				error.textContent = "Unable to copy. Select the response and copy it manually.";
				response.insertBefore(error, readButton);
			}
			finally {
				copyButton.disabled = false;
			}
		};
		response.append(readButton, copyButton, branchButton);
	}

	static GetResponseText(response) {
		return Array.from(response.querySelectorAll('.ares-bubble:not(.ares-thinking):not([aria-busy="true"])'), bubble=> bubble._markdownText ?? "")
			.filter(text=> text.trim().length > 0).join("\n\n");
	}

	UpdateResponseButtons(response) {
		const button = response?.querySelector(":scope > .ares-speak");
		const copy = response?.querySelector(":scope > .ares-response-copy");
		const branch = response?.querySelector(":scope > .ares-response-branch");

		if (!button || !copy || !branch) return;

		const busy = !!response.querySelector('.ares-thinking, .ares-bubble[aria-busy="true"]');
		const supported = !!window.speechSynthesis && typeof window.SpeechSynthesisUtterance === "function";
		button.hidden = busy || Ares.GetSpeechSegments(response).length === 0;
		button.disabled = !supported;
		copy.hidden = busy || Ares.GetResponseText(response).length === 0;
		branch.hidden = busy || !response._branchRequestId;
		branch.disabled = !this.canUse || this.historyLoading;
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
				else {
					text += InlineText(child);
				}
			}
			Flush();
		};

		for (const bubble of response.querySelectorAll('.ares-bubble:not([aria-busy="true"])')) {
			Visit(bubble);
		}

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
			//segment.text = segment.text.replace(/Pro-test/g, "Protest");
			segment.text = segment.text.replace(/A\.R\.E\.S\./g, "Ares");

			if (text.length > 0) text += " ";
			segment.start = text.length;

			text += segment.text;
			if (!/[.!?]["'’”)\]]*$/.test(segment.text)) text += ".";
		}

		const state = {response, button, segments, text, index:0, offset:0, boundary:0, paused:false, utterance:null, synth:window.speechSynthesis};
		this.speech = state;

		Ares.speechOwner = this;

		button.setAttribute("aria-pressed", "true");
		button.setAttribute("aria-label", "Stop reading response");
		button.title = "Stop reading aloud";
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
			value.style.fontWeight = "600";

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
		this.chatPane.appendChild(panel);
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

			if (voices.length > 0 && !voices.some(voice=> Ares.SpeechVoiceId(voice) === this.speechVoice)) {
				this.speechVoice = "";
			}

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
			if (IsCurrent()) {
				this.HighlightSpeech(state, offset);
			}
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
		state.title = "Read aloud";

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
		element._markdownText = text;
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
					await Ares.CopyText(code.textContent, code.ownerDocument);
					button.textContent = "Copied";
					button.setAttribute("aria-label", "Code copied");
					resetTimer = setTimeout(ResetFeedback, 2000);
				}
				catch {
					const error = doc.createElement("div");
					error.className = "ares-error ares-code-copy-error";
					error.setAttribute("role", "alert");
					error.textContent = "Unable to copy.";
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

	static async CopyText(text, doc) {
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

		try {
			let pending = "";

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

			if (direction === "in") this.AddResponseButtons(group);
			this.chatBox.appendChild(group);
		}

		this.lastBubble = {
			group: group,
			bubble: bubble,
			sender: sender
		};

		const isScrolledToBottom = this.IsScrolledToBottom();

		group.insertBefore(wrapper, group.querySelector(":scope > .ares-speak"));

		if (isScrolledToBottom && !this.restoringHistory) {
			setTimeout(()=> wrapper.scrollIntoView({behavior:"smooth"}), 50);
		}

		return bubble;
	}

	CreateTextBubble(text, direction, sender, alias, color, time, branchRequestId = null) {
		if (text.length === 0) return;

		const bubble = this.CreateBubble(direction, sender, alias, color, time);
		Ares.RenderMarkdown(bubble, text);

		if (direction === "in") {
			const response = bubble.closest(".ares-response");
			if (branchRequestId) response._branchRequestId = branchRequestId;
			this.UpdateResponseButtons(response);
		}

		return bubble;
	}
}
