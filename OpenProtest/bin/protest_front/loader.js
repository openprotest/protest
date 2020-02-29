var db_equip = null;
var db_users = null;

var db_equip_ver;
var db_users_ver;

/*
Cache the DB to skip downloading on each refresh.
Download only if the server has a new version.

Modify db_equip_ver and db_users_ver on the fly,
but never store the value on localStorage,
so the database can be self-restore on refresh
in case of corruption or a bug.
*/

async function CheckEquipmentVersion() {
    let oldver = localStorage.getItem("equip_ver");
    if (oldver === null) GetEquipment();

    let xhr = new XMLHttpRequest();
    xhr.onreadystatechange = ()=> {
        if (xhr.readyState == 4 && xhr.status == 200) {
            db_equip_ver = parseInt(xhr.responseText.trim());
            if (oldver < db_equip_ver)
                GetEquipment();
            else
                LoadEquipment(localStorage.getItem("equip"));
        }
    };
    xhr.open("GET", "getequipver", true);
    xhr.send();
}

function GetEquipment() {
    let xhr = new XMLHttpRequest();
    xhr.onreadystatechange = ()=> {
        if (xhr.readyState == 4 && xhr.status == 200) {
            let split = xhr.responseText.split(String.fromCharCode(127));
            if (split.length < 2) return;

            let ver = parseInt(split[0]);
            localStorage.setItem("equip_ver", ver);
            localStorage.setItem("equip", xhr.responseText);

            LoadEquipment(xhr.responseText);
        }
    };
    xhr.open("GET", "getequiplist", true);
    xhr.send();
}

function LoadEquipment(payload) {
    let split = payload.split(String.fromCharCode(127));

    db_equip = [];

    let i = 1;
    while (i < split.length) {
        let len = parseInt(split[i]);
        if (!isNaN(len)) {
            let obj = {};
            for (let j=i+1; j<i+len*4; j+=4)    
                obj[split[j]] = [split[j+1], split[j+2]];

            db_equip.push(obj);
        }
        i += 1 + len*4;
    }
}


async function CheckUsersVersion() {
    let oldver = localStorage.getItem("users_ver");
    if (oldver === null) GetUsers();

    let xhr = new XMLHttpRequest();
    xhr.onreadystatechange = ()=> {
        if (xhr.readyState == 4 && xhr.status == 200) {
            db_users_ver = parseInt(xhr.responseText.trim());
            if (oldver < db_users_ver)
                GetUsers();
            else
                LoadUsers(localStorage.getItem("users"));
        }
    };
    xhr.open("GET", "getusersver", true);
    xhr.send();
}

function GetUsers() {
    let xhr = new XMLHttpRequest();
    xhr.onreadystatechange = ()=> {
        if (xhr.readyState == 4 && xhr.status == 200) {
            let split = xhr.responseText.split(String.fromCharCode(127));
            if (split.length < 2) return;

            let ver = parseInt(split[0]);
            localStorage.setItem("users_ver", ver);
            localStorage.setItem("users", xhr.responseText);

            LoadUsers(xhr.responseText);
        }
    };
    xhr.open("GET", "getuserslist", true);
    xhr.send();
}

function LoadUsers(payload) {
    let split = payload.split(String.fromCharCode(127));

    db_users = [];

    let i = 1;
    while (i < split.length) {
        let len = parseInt(split[i]);
        if (!isNaN(len)) {
            let obj = {};
            for (let j=i+1; j<i+len*4; j+=4)
                obj[split[j]] = [split[j+1], split[j+2]];

            db_users.push(obj);
        }
        i += 1 + len*4;
    }  
}