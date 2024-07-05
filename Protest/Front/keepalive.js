const KEEP = {
	isSecure: window.location.href.toLowerCase().startsWith("https://"),
	socket: null,
	version: "0",
	username: "",
	color: "var(--clr-accent)",
	authorization: [],
	zones: [],
	reconnectCount: 0,
	redDot: document.createElement("div"),
	sessionTtlMapping: { 1:1, 2:2, 3:3, 4:4, 5:5, 6:6, 7:7, 8:14, 9:21, 10:28, 11:60, 12:90 },

	Initialize: ()=> {
		let server = window.location.href;
		server = server.replace("https://", "");
		server = server.replace("http://", "");
		if (server.endsWith("/")) server = server.substring(0, server.indexOf("/"));

		KEEP.socket = new WebSocket((KEEP.isSecure ? "wss://" : "ws://") + server + "/ws/keepalive");

		KEEP.socket.onopen = ()=> {
			KEEP.reconnectCount = 0;

			if (KEEP.redDot.parentElement) {
				container.removeChild(KEEP.redDot);
			}

			setTimeout(() => {
				if (localStorage.getItem("cookie_lifetime") && parseInt(localStorage.getItem("cookie_lifetime")) != 5) {
					KEEP.socket.send(JSON.stringify({
						type: "update-session-ttl",
						ttl: KEEP.sessionTtlMapping[localStorage.getItem("cookie_lifetime")]
					}));
				}
			}, 100);
		};

		KEEP.socket.onclose = ()=> {
			KEEP.redDot.className = "red-dot";
			container.appendChild(KEEP.redDot);

			setTimeout(()=> {
				if (KEEP.reconnectCount >= 3) {
					KEEP.DisconnectNotification();
				}
				else {
					KEEP.reconnectCount++;
					KEEP.Initialize();
				}
			}, 1000);
		};

		KEEP.socket.onmessage = event=> {
			let message = JSON.parse(event.data);
			KEEP.MessageHandler(message);
		};
	},

	MessageHandler: message=> {
		switch (message.action) {
		case "init":
			KEEP.version = message.version;
			KEEP.username = message.username;
			KEEP.color = message.color;
			KEEP.authorization = message.authorization;
			usernameLabel.textContent = KEEP.username;
			break;

		case "log":
			WIN.array.filter(win=> win instanceof Log).forEach(log=> log.Add(message.msg));
			break;

		case "force-reload":
			location.reload();
			break;

		case "update-rbac":
			KEEP.authorization = message.authorization;
			for (let i=0; i<WIN.array.length; i++) {
				WIN.array[i].UpdateAuthorization();
			}
			break;

		case "zones":
			KEEP.zones = message.list;

			for (let i=0; i<KEEP.zones.length; i++) {
				const split = KEEP.zones[i].network.split("/");
				if (split.length !== 2) continue;

				let gw = split[0].split(".").map(o=>parseInt(o));
				if (gw.length != 4) continue;
				if (gw.find(o => o<0 || o>255)) continue;

				let cidr = parseInt(split[1]);
				let octet = Math.floor(cidr / 8);
				let target = cidr % 8;

				let mask = [0, 0, 0, 0];
				for (let i=0; i<octet; i++) { mask[i] = 255; }
				for (let i=octet+1; i<4; i++) { mask[i] = 0; }
				let v = 0;
				for (let i=0; i<target; i++) { v += Math.pow(2, 7-i); }
				mask[octet] = v;

				let first =
					(gw[0] & mask[0]) * 256*256*256 +
					(gw[1] & mask[1]) * 256*256 +
					(gw[2] & mask[2]) * 256 +
					(gw[3] & mask[3]);

				let last =
					(gw[0] | (255 - mask[0])) * 256*256*256 +
					(gw[1] | (255 - mask[1])) * 256*256 +
					(gw[2] | (255 - mask[2])) * 256 +
					(gw[3] | (255 - mask[3]));

				KEEP.zones[i].first = first;
				KEEP.zones[i].last = last;
				KEEP.zones[i].priority = cidr;
			}
			break;

		case "update":
			if (message.type === "device") {
				if (LOADER.devices.version === message.version) break;

				LOADER.devices.data[message.target] = message.obj;

				const view = WIN.array.find(o=> o instanceof DeviceView && o.args.file === message.target);
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
			else if (message.type === "user") {
				if (LOADER.users.version === message.version) break;

				LOADER.users.data[message.target] = message.obj;

				const view = WIN.array.find(o=> o instanceof UserView && o.args.file === message.target);
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
			if (message.type === "device") {
				if (LOADER.devices.version === message.version) break;

				const view = WIN.array.find(o=> o instanceof DeviceView && o.args.file === message.target);
				if (view) view.Close();

				delete LOADER.devices.data[message.target];
				LOADER.devices.version = message.version;

				for (let i = 0; i < WIN.array.length; i++) { //each devices list
					if (!(WIN.array[i] instanceof DevicesList)) continue;
					WIN.array[i].RefreshList();
				}
			}
			else if (message.type === "user") {
				if (LOADER.users.version === message.version) break;

				const view = WIN.array.find(o=> o instanceof UserView && o.args.file === message.target);
				if (view) view.Close();

				delete LOADER.users.data[message.target];
				LOADER.users.version = message.version;

				for (let i = 0; i < WIN.array.length; i++) { //each users list
					if (!(WIN.array[i] instanceof UsersList)) continue;
					WIN.array[i].RefreshList();
				}
			}
			break;


		case "start-fetch":
			for (let i=0; i<WIN.array.length; i++) {
				if (!(WIN.array[i] instanceof Fetch)) continue;
				WIN.array[i].taskTab.style.visibility = "visible";
				WIN.array[i].taskTab.style.animation = "slide-in .4s 1";
			}
			break;

		case "cancel-fetch":
			for (let i = 0; i < WIN.array.length; i++) {
				if (!(WIN.array[i] instanceof Fetch)) continue;
				WIN.array[i].statusValueLabel.textContent = "canceling";
			}
			break;

		case "update-fetch":
			for (let i=0; i<WIN.array.length; i++) {
				if (!(WIN.array[i] instanceof Fetch)) continue;
				WIN.array[i].statusValueLabel.textContent = message.task.status;
				WIN.array[i].progressValueLabel.textContent = `${message.task.completed}/${message.task.total}`;
				WIN.array[i].etcValueLabel.textContent = message.task.etc;
				WIN.array[i].progressBarInner.style.width = `${100 * message.task.completed / message.task.total}%`;
				WIN.array[i].taskTab.style.visibility = "visible";
				WIN.array[i].taskTab.style.animation = "slide-in .4s 1";
			}
			break;

		case "finish-fetch":
			for (let i = 0; i < WIN.array.length; i++) {
				if (!(WIN.array[i] instanceof Fetch)) continue;
				WIN.array[i].ShowPending(message.task);
			}
			break;

		case "abort-fetch":
		case "discard-fetch":
		case "approve-fetch":
			for (let i = 0; i < WIN.array.length; i++) {
				if (!(WIN.array[i] instanceof Fetch)) continue;
				WIN.array[i].ShowDevices();
				WIN.array[i].tabsList[0].className = "v-tab-selected";
				WIN.array[i].taskTab.style.visibility = "hidden";
			}
			break;

		case "chat-text":
		case "chat-emoji":
		case "chat-command":
		case "chat-offer":
		case "chat-answer": {
			if (!KEEP.chatNotificationSound) {
				KEEP.chatNotificationSound = new Audio("notification.ogg");
				const volume = localStorage.getItem("notification_volume") == null ? 80 : parseInt(localStorage.getItem("notification_volume"));
				KEEP.chatNotificationSound.volume = volume / 100;
			}

			if (document.hidden
				&& localStorage.getItem("enable_notification_sound") !== "false") {
				KEEP.chatNotificationSound.play();
			}

			let chatCount = 0;
			for (let i = 0; i < WIN.array.length; i++) {
				if (!(WIN.array[i] instanceof Chat)) continue;

				if (localStorage.getItem("focus_chat_window") === "true") {
					if (WIN.array[i].isMinimized) {
						WIN.array[i].Minimize(false); //restore
					}
					WIN.array[i].BringToFront();
				}

				WIN.array[i].HandleMessage(message);
				chatCount++;

				if (WIN.focused !== WIN.array[i]
					&& message.sender !== KEEP.username
					&& localStorage.getItem("enable_notification_sound") !== "false") {
					KEEP.chatNotificationSound.play();
				}
			}

			if (chatCount === 0) {
				const newChat = new Chat();
				if (localStorage.getItem("focus_chat_window") !== "true") {
					newChat.win.style.display = "none";
					newChat.Minimize();
				}

				if (message.action === "chat-offer" || message.action === "chat-answer") {
					newChat.HandleMessage(message);
				}

				setTimeout(()=>{newChat.win.style.display = "initial";}, WIN.ANIME_DURATION);
				if (localStorage.getItem("enable_notification_sound") !== "false") {
					KEEP.chatNotificationSound.play();
				}
			}

			break;
		}

		case "chat-join":
		case "chat-stream":
		case "chat-ice":
			for (let i = 0; i < WIN.array.length; i++) {
				if (!(WIN.array[i] instanceof Chat)) continue;
				WIN.array[i].HandleMessage(message);

				/*if (WIN.focused !== WIN.array[i] && message.sender !== KEEP.username && localStorage.getItem("enable_notification_sound") !== "false") {
					KEEP.chatNotificationSound.play();
				}*/
			}
			break;

		default:
			console.warn("none register action: " + message.action);
			break;
		}
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

		const reconnectButton = document.createElement("input");
		reconnectButton.type = "button";
		reconnectButton.value = "Connect";
		reconnectButton.style.height = "30px";

		const reloadButton = document.createElement("input");
		reloadButton.type = "button";
		reloadButton.value = "Reload";
		reloadButton.style.height = "30px";

		const ignoreButton = document.createElement("input");
		ignoreButton.type = "button";
		ignoreButton.value = "Ignore";
		ignoreButton.style.height = "30px";

		notification.buttonsBox.append(reconnectButton, reloadButton, ignoreButton);

		reconnectButton.onclick = ()=> {
			KEEP.Initialize();

			notification.notificationBox.style.opacity = "0";
			setTimeout(()=> {
				container.removeChild(notification.notificationBox);
			}, 400);
		};

		reloadButton.onclick = ()=> location.reload();

		ignoreButton.onclick = ()=> {
			notification.notificationBox.style.opacity = "0";
			setTimeout(()=> {
				container.removeChild(notification.notificationBox);
			}, 400);
		};
	}
};