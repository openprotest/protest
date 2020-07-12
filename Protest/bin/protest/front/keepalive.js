let wsKeepAlive = null;

function initKeepAlive() {
    let server = window.location.href;
    server = server.replace("https://", "");
    server = server.replace("http://", "");
    if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

    this.ws = new WebSocket((isSecure ? "wss://" : "ws://") + server + "/ws/keepalive");

    this.ws.onopen = () => {
    };

    this.ws.onclose = () => {
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
    const target  = msg.target;
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
                if (equip && !equip.isClosed) equip.ConfirmBox("This entry has been deleted.", true).addEventListener("click", ()=>equip.Close());

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
                if (user && !user.isClosed) user.ConfirmBox("This entry has been deleted.", true).addEventListener("click", ()=>user.Close());

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
            const userver = parseInt(msg.userver);

            if (equipver != db_equip_ver) {
                //TODO: on connect
            }

            if (userver != db_user_ver) {
                //TODO: on connect
            }
            break;
    }

}
