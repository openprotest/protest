let wsKeepAlive = null;

let KeepAlive_autoreconnectTimeStamp = 0;

function initKeepAlive() {
    let server = window.location.href;
    server = server.replace("https://", "");
    server = server.replace("http://", "");
    if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

    this.ws = new WebSocket((isSecure ? "wss://" : "ws://") + server + "/ws/keepalive");

    this.ws.onopen = () => {
        main.style.filter = "none";
        bottombar.style.filter = "none";
    };

    this.ws.onclose = () => {
        setTimeout(() => {
            if (Date.now() - KeepAlive_autoreconnectTimeStamp < 1000 * 15) { //15s
                KeepAlive_DisconnectNotif();
                main.style.filter = "grayscale(.8)";
                bottombar.style.filter = "grayscale(.8)";
            } else {
                KeepAlive_autoreconnectTimeStamp = Date.now();
                initKeepAlive();
            }
        }, 1000);
    };

    this.ws.onmessage = event => {
        let json = JSON.parse(event.data);
        KeepAlive_MessageHandler(json);
    };

    this.ws.onerror = () => {
    };
}

function KeepAlive_MessageHandler(msg) {
    const action  = msg.action;
    const type    = msg.type;
    const target = msg.target;
    const version = msg.version;

    switch (action) {
        case "update":
            if (type == "equip") { //update equip
                if (db_equip_ver == version) break;

                let db_entry = db_equip.find(o => o[".FILENAME"][0] === target); //update db_equip
                if (db_entry) //exist
                    db_equip[db_equip.indexOf(db_entry)] = msg.obj;
                else //new
                    db_equip.push(msg.obj);

                const equip = $w.array.find(o => o instanceof Equip && o.filename === target); //update view
                if (equip) equip.Update(msg.obj);

                for (let i = 0; i < $w.array.length; i++) { //for each equip list
                    if (!($w.array[i] instanceof ListEquip)) continue;

                    let view = $w.array[i].view.find(o => o[[".FILENAME"][0] == target]); //update view lists
                    if (view) $w.array[i].view[$w.array[i].view.indexOf(view)] = msg.obj;
                    let type = (msg.obj.hasOwnProperty("TYPE")) ? msg.obj["TYPE"][0].toLowerCase() : "";

                    const elements = $w.array[i].content.querySelectorAll(`#id${target}`);

                    if (db_entry) { //exist
                        for (let j = 0; j < elements.length; j++) { //update list element
                            elements[j].innerHTML = "";
                            $w.array[i].InflateElement(elements[j], msg.obj, type);
                        }
                    } else { //new
                        const element = document.createElement("div");
                        element.className = "lst-obj-ele";
                        $w.array[i].list.appendChild(element);
                        $w.array[i].InflateElement(element, msg.obj, type);
                    }
                }

                db_equip_ver = parseInt(version);

            } else if (type == "user") { //update user
                if (db_users_ver == version) break;

                let db_entry = db_users.find(o => o[".FILENAME"][0] === target); //update db_users
                if (db_entry) //exist
                    db_users[db_users.indexOf(db_entry)] = msg.obj;
                else  //new
                    db_users.push(msg.obj);

                const user = $w.array.find(o => o instanceof User && o.filename === target); //update view
                if (user) user.Update(msg.obj);

                for (let i = 0; i < $w.array.length; i++) { //for each user list
                    if (!($w.array[i] instanceof ListUsers)) continue;

                    let view = $w.array[i].view.find(o => o[[".FILENAME"][0] == target]); //update view lists
                    if (view) $w.array[i].view[$w.array[i].view.indexOf(view)] = msg.obj;

                    if (db_entry) { //exist
                        const elements = $w.array[i].content.querySelectorAll(`#id${target}`);
                        for (let j = 0; j < elements.length; j++) { //update list element
                            elements[j].innerHTML = "";
                            $w.array[i].InflateElement(elements[j], msg.obj);
                        }
                    } else { //new
                        const element = document.createElement("div");
                        element.className = "lst-obj-ele";
                        $w.array[i].list.appendChild(element);
                        $w.array[i].InflateElement(element, msg.obj, type);
                    }
                }

                db_users_ver = parseInt(version)
            }
            break;

        case "delete":
            if (type == "equip") { //delete equip
                if (db_equip_ver == version) break;

                for (let i = 0; i < db_equip.length; i++) //delete from db_equip
                    if (db_equip[i][".FILENAME"][0] == target) {
                        db_equip.splice(i, 1);
                        break;
                    }

                const equip = $w.array.find(o => o instanceof Equip && o.filename === target); //close equip
                if (equip && !equip.isClosed) equip.ConfirmBox("This entry has been deleted.", true)?.addEventListener("click", () => equip.Close());

                for (let i = 0; i < $w.array.length; i++) { //for each equip list
                    if (!($w.array[i] instanceof ListEquip)) continue;

                    for (let j = 0; j < $w.array[i].view.length; j++) //delete from view list 
                        if ($w.array[i].view[j][".FILENAME"][0] == target)
                            $w.array[i].view.splice(j, 1);

                    let elements = $w.array[i].content.querySelectorAll(`#id${target}`);
                    for (let j = 0; j < elements.length; j++) //remove list element
                        $w.array[i].list.removeChild(elements[j]);

                    $w.array[i].UpdateViewport();
                }

                db_equip_ver = parseInt(version);

            } else if (type == "user") { //delete user
                if (db_users_ver == version) break;

                for (let i = 0; i < db_users.length; i++) //delete from db_users
                    if (db_users[i][".FILENAME"][0] == target) {
                        db_users.splice(i, 1);
                        break;
                    }

                const user = $w.array.find(o => o instanceof User && o.filename === target); //close user
                if (user && !user.isClosed) user.ConfirmBox("This entry has been deleted.", true)?.addEventListener("click", () => user.Close());

                for (let i = 0; i < $w.array.length; i++) { //for each users list
                    if (!($w.array[i] instanceof ListUsers)) continue;

                    for (let j = 0; j < $w.array[i].view.length; j++) //delete from view list 
                        if ($w.array[i].view[j][".FILENAME"][0] == target)
                            $w.array[i].view.splice(j, 1);

                    let elements = $w.array[i].content.querySelectorAll(`#id${target}`);
                    for (let j = 0; j < elements.length; j++) // remove list element
                        $w.array[i].list.removeChild(elements[j]);

                    $w.array[i].UpdateViewport();
                }

                db_users_ver = parseInt(version)
            }
            break;

        case "version":
            const equipver = parseInt(msg.equipver);
            const usersver = parseInt(msg.userver);

            if (equipver != db_equip_ver) {
                const onEquipLoad = (status, msg) => {
                    if (status != "done") return;
                    for (let i = 0; i < $w.array.length; i++) {

                        if ($w.array[i] instanceof Equip) { //update equip
                            let obj = db_equip.find(o=>o[".FILENAME"] == $w.filename);
                            if (obj) w.array[i].Update(obj);
                        }

                        if ($w.array[i] instanceof ListEquip) //update equip list
                            $w.array[i].RefreshList();
                    }
                };

                LoadEquip(onEquipLoad);
            }

            if (usersver != db_users_ver) {
                const onUsersLoad = (status, msg) => {
                    if (status != "done") return;
                    for (let i = 0; i < $w.array.length; i++) {

                        if ($w.array[i] instanceof User) { //update users
                            let obj = db_users.find(o => o[".FILENAME"] == $w.filename);
                            if (obj) w.array[i].Update(obj);
                        }

                        if ($w.array[i] instanceof ListUsers) //update users list
                            $w.array[i].RefreshList();
                    }
                };

                LoadUsers(onUsersLoad);
            }

            break;

        case "startfetch":
            for (let i = 0; i < $w.array.length; i++) { //for each equip list
                if (!($w.array[i] instanceof Fetch)) continue;
                $w.array[i].tabTask.style.visibility = "visible";
                $w.array[i].lblStatusValue.innerHTML = "Initializing";
                $w.array[i].lblProgressValue.innerHTML = "0/0";
                $w.array[i].lblEtcValue.innerHTML = "Calculating";
                $w.array[i].divProgress.style.width = "0";
            }
            break;

        case "updatefetch":
            for (let i = 0; i < $w.array.length; i++) { //for each equip list
                if (!($w.array[i] instanceof Fetch)) continue;
                $w.array[i].tabTask.style.visibility = "visible";
                $w.array[i].lblStatusValue.innerHTML = msg.task.status;
                $w.array[i].lblProgressValue.innerHTML = `${msg.task.completed}/${msg.task.total}`;
                $w.array[i].lblEtcValue.innerHTML = msg.task.etc;
                $w.array[i].divProgress.style.width = `${(100 * msg.task.completed) / msg.task.total}%`;
            }
            break;

        case "finishfetch":
            for (let i = 0; i < $w.array.length; i++) { //for each equip list
                if (!($w.array[i] instanceof Fetch)) continue;
                $w.array[i].tabTask.style.visibility = "visible";

                if ($w.array[i].args == "task") 
                    $w.array[i].ShowPending(msg.task);
            }
            break;

        /*case "discardfetch":
            for (let i = 0; i < $w.array.length; i++) { //for each equip list
                if (!($w.array[i] instanceof Fetch)) continue;
                $w.array[i].tabTask.style.visibility = "hidden";
            }
            break;*/

        case "approvedfetch":
            for (let i = 0; i < $w.array.length; i++) { //for each equip list
                if (!($w.array[i] instanceof Fetch)) continue;
                $w.array[i].tabTask.style.visibility = "hidden";
            }
            break;
    }
}


function KeepAlive_Notification(message) {
    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.width = "256px";
    container.style.minHeight = "100px";
    container.style.right = "8px";
    container.style.bottom = "8px";
    container.style.backgroundColor = "#202020";
    container.style.padding = "16px 8px";
    container.style.border = "rgb(84,84,84) solid 1px";
    container.style.borderRadius = "4px";
    //container.style.boxShadow = "rgba(0,0,0,.85) 0 0 8px";
    container.style.animation = "slide-in .4s 1";
    container.style.transition = ".4s";
    main.appendChild(container);

    const lblMessage = document.createElement("div");
    lblMessage.style.color = "#c0c0c0";
    lblMessage.style.textAlign = "center";
    lblMessage.style.fontSize = "16px";
    lblMessage.innerHTML = message;
    container.appendChild(lblMessage);

    const buttonsBox = document.createElement("div");
    buttonsBox.style.textAlign = "center";
    buttonsBox.style.paddingTop = "16px";
    container.appendChild(buttonsBox);

    return {
        container: container,
        lblMessage: lblMessage,
        buttonsBox: buttonsBox
    };
}

function KeepAlive_DisconnectNotif() {
    let noitfication = KeepAlive_Notification("Communication with the server has been lost.");

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

    noitfication.buttonsBox.appendChild(btnReconnect);
    noitfication.buttonsBox.appendChild(btnReload);
    noitfication.buttonsBox.appendChild(btnIgnore);

    btnReconnect.onclick = () => {
        initKeepAlive();

        noitfication.container.style.opacity = "0";
        setTimeout(() => {
            main.removeChild(noitfication.container);
        }, 400);
    };

    btnReload.onclick = () => {
        location.reload();
    };

    btnIgnore.onclick = () => {
        main.style.filter = "none";
        bottombar.style.filter = "none";

        noitfication.container.style.opacity = "0";
        setTimeout(() => {
            main.removeChild(noitfication.container);
        }, 400);
    };
}