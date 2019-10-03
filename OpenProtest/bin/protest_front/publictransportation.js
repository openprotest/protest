var pt_socket;
var pt_hash = {};

var pt_last_autoconnect = 0;
var pt_deathdate = 0;

function initPublicTransportation() {
    let server = window.location.href.toLowerCase();
    server = server.replace("https://", "");
    server = server.replace("http://", "");
    if (server.indexOf("/") > 0) server = server.substring(0, server.indexOf("/"));

    pt_socket = new WebSocket((isSecure? "wss://" : "ws://") + server + "/ws/publictransportation");

    pt_socket.onopen = event => {
        console.log("Pro-test is connected.");
    };

    pt_socket.onclose = ()=> {
        if (new Date().getTime() - pt_last_autoconnect > 8000) { //autoconnect once every 8s
            setTimeout(()=> {
                pt_last_autoconnect = new Date().getTime();
                initPublicTransportation();
                return;
            }, 500);
            return;
        }

        console.log("Pro-test is disconnected.");
        let opt = showNotification("Lost connection to the server.", false);
        opt[0].value = "Reconnect";
        opt[1].value = "Reload";
        main.style.filter = bottombar.style.filter = "grayscale(.6)";
        
        opt[0].addEventListener("click", ()=> {
            initPublicTransportation();
            main.style.filter = bottombar.style.filter = "none";
        });

        opt[1].addEventListener("click", ()=> {
            location.reload();
        });
    };

    pt_socket.onmessage = event => {
        let split = event.data.split(String.fromCharCode(127));

        if (split[0] == "life") {
            let life = parseInt(split[1]);
            pt_deathdate = new Date().getTime() + life * 1000;

        } else if (split[0] == "update_equip" || split[0] == "update_users") {
            if ($w.array.length == 0) { //if no open windows, refresh
                location.reload();
                return;
            } else {
                if (split[0] == "update_equip") {
                    let xhr = new XMLHttpRequest();
                    xhr.onreadystatechange = () => {
                        if (xhr.readyState == 4 && xhr.status == 200) {
                            let ver = parseInt(xhr.responseText.trim());
                            if (ver > parseInt(db_equip_ver)) {
                                let opt = showNotification("Equipment database has been modified. Do you want to sync to the latest version?");
                                opt[0].value = "Yes";
                                opt[1].value = "Not now";
                                opt[0].addEventListener("click", () => { location.reload(); });
                            }
                        }
                    };
                    xhr.open("GET", "getequipver", true);
                    xhr.send();

                } else if (split[0] == "update_users") {
                    let xhr = new XMLHttpRequest();
                    xhr.onreadystatechange = () => {
                        if (xhr.readyState == 4 && xhr.status == 200) {
                            let ver = parseInt(xhr.responseText.trim());
                            if (ver > parseInt(db_users_ver)) {
                                let opt = showNotification("Users database has been modified. Do you want to sync to the latest version?");
                                opt[0].value = "Yes";
                                opt[1].value = "Not now";
                                opt[0].addEventListener("click", () => { location.reload(); });
                            }
                        }
                    };
                    xhr.open("GET", "getusersver", true);
                    xhr.send();
                }
            }
            return;


        /*
        split[0] = opt
        split[1] = version
        split[2] = filename
        */

        } else if (split[0] == "dele") { //delete equip
            if (db_equip_ver == split[1]) return;

            for (let i=0; i<$w.array.length; i++) {
                if ($w.array[i] instanceof Equip && $w.array[i].filename == split[2]) { //equip matched
                    $w.array[i].ConfirmBox("The equipment has been deleted.", true);

                } else if ($w.array[i] instanceof EquipList) { //equiplist
                    let elements = $w.array[i].content.querySelectorAll("[id=e" + split[2] + "]");
                    for (let j = 0; j < elements.length; j++)
                        $w.array[i].content.removeChild(elements[j]);

                    $w.array[i].AfterResize();
                }
            }

            for (let i = 0; i < db_equip.length; i++) //update db_equip
                if (db_equip[i][".FILENAME"][0] == targer) {
                    db_equip.splice(i, 1);
                    break;
                }
            return;

        } else if (split[0] == "delu") { //delete user
            if (db_users_ver == split[1]) return;

            for (let i = 0; i < $w.array.length; i++) {
                if ($w.array[i] instanceof User && $w.array[i].filename == split[2]) { //user matched
                    $w.array[i].ConfirmBox("The user has been deleted.", true);

                } else if ($w.array[i] instanceof UserList) { //userslist
                    let elements = $w.array[i].content.querySelectorAll("[id=u" + split[2] + "]");
                    for (let j = 0; j < elements.length; j++)
                        $w.array[i].content.removeChild(elements[j]);

                    $w.array[i].AfterResize();
                }
            }

            for (let i = 0; i < db_users.length; i++) //update db_users
                if (db_users[i][".FILENAME"][0] == split[2]) {
                    db_users.splice(i, 1);
                    break;
                }
            return;

        } else if (split[0] == "modifye") { //modify equip
            if (db_equip_ver == split[1]) return;
            updateTargetEquip(split[2]);
            return;

        } else if (split[0] == "modifyu") { //modify user
            if (db_users_ver == split[1]) return;
            updateTargetUser(split[2]);
            return;
        }


        for (let i=0; i<split.length; i++) {
            let s = split[i].split(";");

            for (let j = 0; j < $w.array.length; j++) {
                if ($w.array[j] instanceof Equip && $w.array[j].filename == s[0]) { //equip
                    let current = $w.array[j];

                    while (current.instant.childNodes.length > 0) //remove previous info
                        current.instant.removeChild(current.instant.childNodes[0]);

                    for (let k=1; k<s.length-1; k+=2)
                        switch (s[k]) {
                            case "Ping":
                                if (current.pingResult != undefined) {
                                    let ping = s[k + 1];
                                    current.pingResult.style.backgroundColor = PingColor(ping);
                                    current.dot.style.backgroundColor = current.pingResult.style.backgroundColor;
                                    current.pingLabel.style.color = current.pingResult.style.backgroundColor;
                                    current.pingLabel.innerHTML = (isNaN(ping) || ping < 0) ? "" : ping + "ms";
                                }
                            break;

                            default:
                            if (s[k + 1].length > 0) {
                                let newProp = current.Property(s[k], s[k+1], "");
                                newProp.style.fontStyle = "italic";
                                current.instant.appendChild(newProp);
                            }
                        }
                    break;
                }

                if ($w.array[j] instanceof User && $w.array[j].filename == s[0]) { //users
                    let current = $w.array[j];

                    while (current.instant.childNodes.length > 0) //remove previous info
                        current.instant.removeChild(current.instant.childNodes[0]);

                    for (let k=1; k<s.length-1; k+=2) {
                        if (s[k + 1].length > 0) {
                            let newProp = current.Property(s[k], s[k+1], "");
                            newProp.style.fontStyle = "italic";
                            current.instant.appendChild(newProp);
                        }

                        if (s[k] == "Lockout time" && s[k+1].length > 0) { //user is locked
                            $w.array[j].btnUnlock.childNodes[0].style.transition = ".4s";
                            $w.array[j].btnUnlock.childNodes[0].style.backgroundImage = "url(res/lock.svgz)";
                            $w.array[j].btnUnlock.childNodes[0].style.filter = "invert(.5) sepia(1) hue-rotate(-40deg) saturate(12)";
                        }
                    }
                    break;
                }

            }

        }
    };

    pt_socket.onerror = error=> {
        console.log(error);
    };
}


function updateTargetEquip(target) {
    let xhr = new XMLHttpRequest();
    xhr.onreadystatechange = () => {
        if (xhr.readyState == 4 && xhr.status == 200) { //OK
            let split = xhr.responseText.split(String.fromCharCode(127));

            let db_entry = {}; //create new entry
            for (let i = 0; i < split.length - 3; i += 4)
                db_entry[split[i]] = [split[i + 1], split[i + 2]];

            for (let i = 0; i < db_equip.length; i++) //overwrite old entry
                if (db_equip[i][".FILENAME"][0] == target) {
                    db_equip[i] = db_entry;
                    break;
                }

            let c_type = (db_entry.hasOwnProperty("TYPE")) ? db_entry["TYPE"][0].toLowerCase() : "";
            
            for (let i = 0; i < $w.array.length; i++) {
                if ($w.array[i] instanceof Equip && $w.array[i].filename == target) //equip matched
                    $w.array[i].ConfirmBox("The equipment has been modified.", true);

                if ($w.array[i] instanceof EquipList) {
                    let elements = $w.array[i].content.querySelectorAll("[id=e" + target + "]");
                    for (let j = 0; j < elements.length; j++) {
                        elements[j].innerHTML = "";
                        $w.array[i].FillElement(elements[j], db_entry, c_type);
                    }
                }
            }

        }
    };
    xhr.open("GET", "gettargetequip&" + target, true);
    xhr.send();
}

function updateTargetUser(target) {
    let xhr = new XMLHttpRequest();
    xhr.onreadystatechange = () => {
        if (xhr.readyState == 4 && xhr.status == 200) { //OK
            let split = xhr.responseText.split(String.fromCharCode(127));

            let db_entry = {}; //create new entry
            for (let i = 0; i < split.length - 3; i += 4)
                db_entry[split[i]] = [split[i + 1], split[i + 2]];

            for (let i = 0; i < db_users.length; i++) //overwrite old entry
                if (db_users[i][".FILENAME"][0] == target) {
                    db_users[i] = db_entry;
                    break;
                }

            for (let i = 0; i < $w.array.length; i++) {
                if ($w.array[i] instanceof User && $w.array[i].filename == target) //user matched
                    $w.array[i].ConfirmBox("The user has been modified.", true);

                if ($w.array[i] instanceof UserList) {
                    let elements = $w.array[i].content.querySelectorAll("[id=u" + target + "]");
                    for (let j = 0; j < elements.length; j++) {
                        elements[j].innerHTML = "";
                        $w.array[i].FillElement(elements[j], db_entry);
                    }
                }
            }

        }
    };
    xhr.open("GET", "gettargetuser&" + target, true);
    xhr.send();
}


publicTransportationLoop();
function publicTransportationLoop() {
    for (let i = 0; i < $w.array.length; i++) 
        if ($w.array[i] instanceof Equip) {
            pt_equip($w.array[i]);
        } else if ($w.array[i] instanceof User) {
            pt_user($w.array[i]);
        }

    setTimeout(()=>{ publicTransportationLoop(); }, 180000); //3 min
}

function pt_equip(o) {
    if (!o.equip) return; //on new equip
    if (!o.equip.hasOwnProperty(".FILENAME")) return;
    let filename = o.equip[".FILENAME"][0];

    if (pt_socket == null || pt_socket.readyState != 1) return;
    pt_socket.send("equip_info:" + filename);
}

function pt_user(o) {
    if (!o.user) return; //on new user
    if (!o.user.hasOwnProperty(".FILENAME")) return;
    let filename = o.user[".FILENAME"][0];

    if (pt_socket == null || pt_socket.readyState != 1) return;
    pt_socket.send("user_info:" + filename);
}