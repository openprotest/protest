const KEEP = {
	isSecure: window.location.href.toLowerCase().startsWith("https://"),
	socket: null,
	version: "0",
	username: "",
	color: "var(--clr-accent)",
	authorization: [],
	lastReconnect: 0,
	redDot: document.createElement("div"),

	Initialize: ()=> {
		let server = window.location.href;
		server = server.replace("https://", "");
		server = server.replace("http://", "");
		if (server.endsWith("/")) server = server.substring(0, server.indexOf("/"));
		
		KEEP.socket = new WebSocket((KEEP.isSecure ? "wss://" : "ws://") + server + "/ws/keepalive");

		KEEP.socket.onopen = ()=> {
			if (KEEP.redDot.parentElement) {
				container.removeChild(KEEP.redDot);
			}
			//KEEP.socket.send("hello from client");
		};

		KEEP.socket.onclose = ()=> {
			KEEP.redDot.className = "red-dot";
			container.appendChild(KEEP.redDot);

			setTimeout(()=> {
				if (Date.now() - KEEP.lastReconnect < 5_000) { //5s
					KEEP.DisconnectNotification();
				}
				else {
					KEEP.lastReconnect = Date.now();
					KEEP.Initialize();
				}
			}, 1000);
		};

		KEEP.socket.onmessage = event=> {
			let message = JSON.parse(event.data);
			KEEP.MessageHandler(message);
		};

		KEEP.socket.onerror = ()=> { };
	},

	MessageHandler: message=> {
		switch (message.action) {
		case "init":
			KEEP.version = message.version;
			KEEP.username = message.username;
			KEEP.color = message.color;
			KEEP.authorization = message.authorization;
			lblUsername.textContent = KEEP.username;
			break;

		case "log":
			WIN.array.filter(win=> win instanceof Log).forEach(log=> log.Add(message.msg));
			break;

		case "forcereload":
			location.reload();
			break;

		case "updateacl":
			KEEP.authorization = message.authorization;
			for (let i=0; i<WIN.array.length; i++) {
				WIN.array[i].UpdateAuthorization();
			}
			break;

		case "update":
			if (message.type === "devices") {
				if (LOADER.devices.version === message.version) break;

				LOADER.devices.data[message.target] = message.obj;

				const view = WIN.array.find(o=> o instanceof DeviceView && o.params.file === message.target);
				if (view) {
					view.link = LOADER.devices.data[message.target];
					view.InitializePreview();
				}

				for (let i = 0; i < WIN.array.length; i++) { //each devices list
					if (!(WIN.array[i] instanceof DevicesList)) continue;
					WIN.array[i].RefreshList();
				}

				LOADER.devices.version = message.version;
			}
			else if (message.type === "users") {
				if (LOADER.users.version === message.version) break;

				LOADER.users.data[message.target] = message.obj;
				
				const view = WIN.array.find(o=> o instanceof UserView && o.params.file === message.target);
				if (view) {
					view.link = LOADER.users.data[message.target];
					view.InitializePreview();
				}

				for (let i = 0; i < WIN.array.length; i++) { //each users list
					if (!(WIN.array[i] instanceof UsersList)) continue;
					WIN.array[i].RefreshList();
				}

				LOADER.users.version = message.version;
			}
			break;

		case "delete":
			if (message.type === "devices") {
				if (LOADER.devices.version === message.version) break;

				const view = WIN.array.find(o=> o instanceof DeviceView && o.params.file === message.target);
				if (view) view.Close();

				delete LOADER.devices.data[message.target];
				LOADER.devices.version = message.version;

				for (let i = 0; i < WIN.array.length; i++) { //each devices list
					if (!(WIN.array[i] instanceof DevicesList)) continue;
					WIN.array[i].RefreshList();
				}
			}
			else if (message.type === "users") {
				if (LOADER.users.version === message.version) break;
				
				const view = WIN.array.find(o=> o instanceof UserView && o.params.file === message.target);
				if (view) view.Close();

				delete LOADER.users.data[message.target];
				LOADER.users.version = message.version;

				for (let i = 0; i < WIN.array.length; i++) { //each users list
					if (!(WIN.array[i] instanceof UsersList)) continue;
					WIN.array[i].RefreshList();
				}
			}
			break;


		case "startfetch":
			for (let i = 0; i < WIN.array.length; i++) {
				if (!(WIN.array[i] instanceof Fetch)) continue;
				WIN.array[i].tabTask.style.visibility = "visible";
				WIN.array[i].tabTask.style.animation = "slide-in .4s 1";
			}
			break;

		case "cancelfetch":
			for (let i = 0; i < WIN.array.length; i++) {
				if (!(WIN.array[i] instanceof Fetch)) continue;
				WIN.array[i].lblStatusValue.textContent = "canceling";
			}
			break;

		case "updatefetch":
			for (let i = 0; i < WIN.array.length; i++) {
				if (!(WIN.array[i] instanceof Fetch)) continue;
				WIN.array[i].lblStatusValue.textContent = message.task.status;
				WIN.array[i].lblProgressValue.textContent = `${message.task.completed}/${message.task.total}`;
				WIN.array[i].lblEtcValue.textContent = message.task.etc;
				WIN.array[i].divProgress.style.width = `${100 * message.task.completed / message.task.total}%`;
			}
			break;

		case "finishfetch":
			for (let i = 0; i < WIN.array.length; i++) {
				if (!(WIN.array[i] instanceof Fetch)) continue;
				WIN.array[i].ShowPending(message.task);
			}
			break;

		case "abortfetch":
		case "discardfetch":
		case "approvefetch":
			for (let i = 0; i < WIN.array.length; i++) {
				if (!(WIN.array[i] instanceof Fetch)) continue;
				WIN.array[i].ShowDevices();
				WIN.array[i].tabsList[0].className = "v-tab-selected";
				WIN.array[i].tabTask.style.visibility = "hidden";

			}
			break;
			
		case "chattext":
		case "chatstream":
			for (let i = 0; i < WIN.array.length; i++) {
				if (!(WIN.array[i] instanceof Chat)) continue;
				WIN.array[i].HandleMessage(message);
			}
			break;

		default:
			console.log("none register action: " + message.action);
			break;
		}
	},

	SendAction: action=> {
		if (KEEP.socket === null || KEEP.socket.readyState !== 1) return;
		KEEP.socket.send(action);
	},

	PushNotification: msg=> {
		const notificationBox = document.createElement("div");
		notificationBox.className = "notification-box";
		container.appendChild(notificationBox);
		
		const message = document.createElement("div");
		message.textContent = msg;
		message.style.height = "64px";
		message.style.fontSize = "16px";
		message.style.fontWeight = "600";
		notificationBox.appendChild(message);
	
		const buttonsBox = document.createElement("div");
		buttonsBox.style.paddingTop = "16px";
		notificationBox.appendChild(buttonsBox);
	
		return {
			notificationBox: notificationBox,
			message: message,
			buttonsBox: buttonsBox
		};
	},

	DisconnectNotification: ()=> {
		const notification = KEEP.PushNotification("The connection to the server has been lost.");

		const btnReconnect = document.createElement("input");
		btnReconnect.type = "button";
		btnReconnect.value = "Connect";
		btnReconnect.style.height = "30px";
	
		const btnReload = document.createElement("input");
		btnReload.type = "button";
		btnReload.value = "Reload";
		btnReload.style.height = "30px";
	
		const btnIgnore = document.createElement("input");
		btnIgnore.type = "button";
		btnIgnore.value = "Ignore";
		btnIgnore.style.height = "30px";

		notification.buttonsBox.append(btnReconnect, btnReload, btnIgnore);

		btnReconnect.onclick = ()=> {
			KEEP.Initialize();
	
			notification.notificationBox.style.opacity = "0";
			setTimeout(()=> {
				container.removeChild(notification.notificationBox);
			}, 400);
		};
	
		btnReload.onclick = ()=> {
			location.reload();
		};
	
		btnIgnore.onclick = ()=> {
			notification.notificationBox.style.opacity = "0";
			setTimeout(()=> {
				container.removeChild(notification.notificationBox);
			}, 400);
		};
	}
};