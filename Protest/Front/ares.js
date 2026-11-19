"use strict";
class Ares extends Window {
	constructor(args) {
		super();
		this.args = args ?? {agent:null, model:null};
		this.connection = null;
		this.connectionDialog = null;
		this.canUse = false;

		Window.AddCssDependencies("ares.css");

		this.SetTitle("A.R.E.S.");
		this.SetIcon("mono/ares.svg");

		this.InitializeComponents();
		this.UpdateAuthorization();
		this.ConnectDialog();
	}

	Close() { //overrides
		this.connectionDialog?.listController?.abort();
		this.connectionDialog?.modelsController?.abort();
		this.connectionDialog = null;
		super.Close();
	}

	InitializeComponents() {
		this.input = document.createElement("div");
		this.input.contentEditable = "false";
		this.input.setAttribute("role", "textbox");
		this.input.setAttribute("aria-label", "Ask A.R.E.S.");
		this.input.setAttribute("aria-multiline", "true");
		this.input.className = "ares-input";
		this.content.appendChild(this.input);
		this.defaultElement = this.input;
	}

	UpdateAuthorization() { //overrides
		super.UpdateAuthorization();
		const previouslyAllowed = this.canUse;
		this.canUse = KEEP.authorization.includes("*") || KEEP.authorization.includes("ares:write");
		if (!this.input) return;
		const ready = this.canUse && this.connection !== null;
		this.input.contentEditable = ready ? "true" : "false";
		this.input.setAttribute("aria-disabled", !ready);

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
			state.refreshButton.disabled = true;
			state.status.textContent = "A.R.E.S. access is required. Contact your administrator.";
		}
		else if (!previouslyAllowed) {
			state.reload();
		}
	}

	ConnectDialog() {
		if (this.isClosed || this.connection || this.connectionDialog) return;
		const dialog = this.DialogBox("240px");
		if (dialog === null) return;
		const {okButton, cancelButton, innerBox, buttonBox} = dialog;
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

		const refreshButton = document.createElement("input");
		refreshButton.type = "button";
		refreshButton.value = "Refresh";
		buttonBox.insertBefore(refreshButton, okButton);

		const state = {agentSelect, modelSelect, okButton, refreshButton, status, agents:[], selection:null};
		this.connectionDialog = state;
		const IsCurrent = controller=> this.connectionDialog === state && !this.isClosed && !controller.signal.aborted;

		const ResetModels = label=> {
			state.selection = null;
			modelSelect.replaceChildren(new Option(label, ""));
			modelSelect.disabled = true;
			okButton.disabled = true;
		};

		agentSelect.onchange = async ()=> {
			state.modelsController?.abort();
			ResetModels("Select a model");
			const agent = state.agents.find(entry=> entry.id === agentSelect.value);
			if (!agent || !this.canUse) return;
			const controller = new AbortController();
			state.modelsController = controller;
			status.textContent = "Loading models…";
			try {
				const response = await fetch(`ares/models?id=${encodeURIComponent(agent.id)}`, {signal:controller.signal});
				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
				const selection = await response.json();
				if (selection.error) throw selection.error;
				if (!IsCurrent(controller)) return;
				if (selection.agent.id !== agent.id || selection.agent.name !== agent.name || selection.agent.type !== agent.type) {
					throw new Error("The agent settings changed. Refresh the choices before continuing.");
				}
				const placeholder = new Option("Select a model", "", true, true);
				placeholder.disabled = true;
				modelSelect.replaceChildren(placeholder);
				for (const model of selection.models) {
					modelSelect.add(new Option(model.name === model.id ? model.id : `${model.name} (${model.id})`, model.id));
				}
				if (selection.models.length === 0) throw new Error("No models are available for this agent");
				state.selection = selection;
				modelSelect.disabled = false;
				status.textContent = "";
			}
			catch (ex) {
				if (!IsCurrent(controller)) return;
				ResetModels("Unable to load models");
				status.textContent = ex.message ?? String(ex);
			}
		};

		modelSelect.onchange = ()=> {
			okButton.disabled = !this.canUse || !state.selection || !modelSelect.value;
		};

		state.reload = refreshButton.onclick = async ()=> {
			if (!this.canUse || this.isClosed) return;
			state.listController?.abort();
			state.modelsController?.abort();
			const controller = new AbortController();
			state.listController = controller;
			agentSelect.replaceChildren(new Option("Loading agents…", ""));
			agentSelect.disabled = true;
			ResetModels("Select an agent first");
			refreshButton.disabled = true;
			status.textContent = "";
			try {
				const response = await fetch("ares/agents", {signal:controller.signal});
				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
				const agents = await response.json();
				if (agents.error) throw agents.error;
				if (!IsCurrent(controller)) return;
				state.agents = agents;
				const placeholder = new Option("Select an agent", "", true, true);
				placeholder.disabled = true;
				agentSelect.replaceChildren(placeholder);
				for (const agent of agents) {
					agentSelect.add(new Option(`${agent.name} (${agent.label})`, agent.id));
				}
				agentSelect.disabled = agents.length === 0;
				if (agents.length === 0) status.textContent = "No enabled agents. Add an agent in Infrastructure → A.R.E.S., then refresh.";
			}
			catch (ex) {
				if (!IsCurrent(controller)) return;
				agentSelect.replaceChildren(new Option("Unable to load agents", ""));
				status.textContent = ex.message ?? String(ex);
			}
			finally {
				if (IsCurrent(controller)) refreshButton.disabled = !this.canUse;
			}
		};

		okButton.onclick = async ()=> {
			const selection = state.selection;
			const model = selection?.models.find(entry=> entry.id === modelSelect.value);
			if (!this.canUse || !selection || !model || okButton.disabled) return;
			const controller = new AbortController();
			state.modelsController = controller;
			agentSelect.disabled = modelSelect.disabled = refreshButton.disabled = okButton.disabled = true;
			status.textContent = "Checking the selected agent and model…";
			try {
				const response = await fetch(`ares/models?id=${encodeURIComponent(selection.agent.id)}`, {signal:controller.signal});
				if (response.status !== 200) LOADER.HttpErrorHandler(response.status);
				const current = await response.json();
				if (current.error) throw current.error;
				if (!IsCurrent(controller)) return;
				if (current.revision !== selection.revision) throw new Error("The agent settings changed. Refresh the choices and confirm your selection again.");
				if (!current.models.some(entry=> entry.id === model.id)) throw new Error("The selected model is no longer available. Refresh and select a model.");

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
				if (IsCurrent(controller)) status.textContent = ex.message ?? String(ex);
			}
			finally {
				if (IsCurrent(controller)) {
					agentSelect.disabled = !this.canUse;
					modelSelect.disabled = !this.canUse;
					refreshButton.disabled = !this.canUse;
					modelSelect.onchange();
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

		if (this.canUse) state.reload();
		else this.UpdateAuthorization();
	}

}
