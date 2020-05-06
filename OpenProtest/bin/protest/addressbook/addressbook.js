var isIE = (navigator.userAgent.indexOf("MSIE") > -1);

var searchbar = document.getElementById("searchbar");
var container = document.getElementById("container");
var txtSearch = document.getElementById("txtSearch");
var btnViewas = document.getElementById("btnViewas");
var btnGetContacts = document.getElementById("btnGetContacts");

var addressbook = [];
var lastSearchValue = "";

var viewas = (localStorage.getItem("viewas") != null)? localStorage.getItem("viewas") : "card";
if (viewas == "list") btnViewas.className = "bar-button viewas-list";

btnViewas.onclick = btnViewas_onclick;
btnGetContacts.onclick = btnGetContacts_onclick;
txtSearch.onchange  = txtSearch_onchange;
txtSearch.onkeyup   = txtSearch_onchange;
txtSearch.onmouseup = txtSearch_onchange;

txtSearch.onkeydown = function(event) {
    if (event.keyCode == 27)
        txtSearch.value = "";
};

GetBook();

if (window.location.href.indexOf("#") > -1) {
    lastSearchValue = window.location.href.substring(window.location.href.indexOf("#") + 1, window.location.href.length);
    txtSearch.value = lastSearchValue;
    txtSearch_onchange();
}

function btnViewas_onclick() {
    if (viewas == "card") {
        viewas = "list";
        btnViewas.className = "bar-button viewas-list";
    } else {
        viewas = "card";
        btnViewas.className = "bar-button viewas-card";
    }

    localStorage.setItem("viewas", viewas);

    let allItems = container.childNodes;
    for (let i=0; i<allItems.length; i++)
        allItems[i].className = "item " + viewas;
}

function btnGetContacts_onclick() {
    const NL = String.fromCharCode(13) + String.fromCharCode(10);
    const TB = String.fromCharCode(9);

    let keys = (txtSearch.value.length == 0) ? [] : txtSearch.value.split(" ");
    let text = "";

    for (let i = 0; i < addressbook.length; i++) {
        let isMatched = true;

        for (let j=0; j < keys.length; j++)
            if (addressbook[i].keys.indexOf(keys[j]) == -1) {
                isMatched = false;
                break;
            }
    
        if (!isMatched) continue;

        text += "BEGIN:VCARD" + NL;
        text += "VERSION:2.1" + NL;

        if (addressbook[i].lastname.length == 0 && addressbook[i].firstname.length == 0)
            text += "FN:" + addressbook[i].title + NL;
        else {
            text += "N:" + addressbook[i].firstname + ";" + addressbook[i].lastname + ";;" + NL;
            text += "FN:" + addressbook[i].firstname + " " + addressbook[i].lastname + NL;
        }

        if (addressbook[i].title.length > 0)     text += "TITLE:" + addressbook[i].title + NL;
        if (addressbook[i].deparment.length > 0) text += "ORG:" + addressbook[i].deparment + NL;
        if (addressbook[i].email.length > 0)     text += "EMAIL:" + addressbook[i].email + NL;

        let numbers = addressbook[i].phone.split(";");
        for (let j=0; j<numbers.length; j++) {
            numbers[j] = numbers[j].trim();
            numbers[j] = numbers[j].replace(" ", "");
            if (numbers[j].length == 0) continue;

            if (numbers[j].length == 4 && numbers[j][0] == "5") //annabelle
                numbers[j] == "2688-" + numbers[j];

            else if (numbers[j].length == 3 && numbers[j][0] == "7") //almyra
                numbers[j] = "26888-" + numbers[j];

            else if (numbers[j].length == 2 && numbers[j][0] == "2") //almyra
                numbers[j] = "26888-" + numbers[j];

            else if (numbers[j].length == 4 && numbers[j][0] == "8") //anassa
                numbers[j] = "2688-" + numbers[j];

            else if (numbers[j].length == 4 && numbers[j][0] == "3") //aloe
                numbers[j] = "2620-" + numbers[j];

            text += "TEL;WORK:" + numbers[j] + NL;
        }

        if (addressbook[i].mobile.length > 0) text += "TEL;CELL:" + addressbook[i].mobile.replace(" ", "") + NL;
        if (addressbook[i].mobexe.length > 0) text += "TEL;CELL:" + addressbook[i].mobexe.replace(" ", "") + NL;

        text += "END:VCARD" + NL + NL;
    }
    
    const pseudo = document.createElement("a");
    pseudo.style.display = "none";
    document.body.appendChild(pseudo);

    let filename = (txtSearch.value.length == 0)? "All contacts" : "contacts_" + txtSearch.value;

    pseudo.setAttribute("href", "data:text/vcard;charset=utf-8," + encodeURI(text));
    pseudo.setAttribute("download", filename + ".vcf");

    pseudo.click(null);

    document.body.removeChild(pseudo);
}

function txtSearch_onchange() {
    if (lastSearchValue == txtSearch.value.trim()) return;
    lastSearchValue = txtSearch.value.trim();

    let current = txtSearch.value;
    setTimeout(()=> {
        if (current != txtSearch.value) return;
        window.location.href = "#" + txtSearch.value;
        Search(txtSearch.value.toLocaleLowerCase());
    }, 200);
}

function Search(key) {
    container.scrollTop = 0;
    container.innerHTML = "";

    let keys = key.toLowerCase().split(" ");
    let count = 0;

    for (let i = 0; i < addressbook.length; i++) {
        let isMatched = true;
        
        for (let j=0; j < keys.length; j++)
            if (addressbook[i].keys.indexOf(keys[j]) == -1) {
                isMatched = false;
                break;
            }
        
        if (!isMatched) continue;

        let div = document.createElement("div");
        div.className = viewas;
        div.id = "i" + i;
        if (count < 64) div.style.animationDuration = (count*.05) + "s";
        container.appendChild(div);

        let lblTitle = document.createElement("div");
        lblTitle.innerHTML = (addressbook[i].title == "")? "--" : addressbook[i].title;
        div.appendChild(lblTitle);

        let lblName = document.createElement("div");
        lblName.innerHTML = addressbook[i].firstname + " " + addressbook[i].lastname;
        div.appendChild(lblName);

        let lblDeparment = document.createElement("div");
        lblDeparment.innerHTML = addressbook[i].deparment;
        div.appendChild(lblDeparment);

        let lblEmail = document.createElement("div");
        lblEmail.innerHTML = addressbook[i].email;
        div.appendChild(lblEmail);

        let lblPhone = document.createElement("div");
        lblPhone.innerHTML = addressbook[i].phone;
        lblPhone.title = "Phone number";
        div.appendChild(lblPhone);

        let lblMobile = document.createElement("div");
        lblMobile.innerHTML = addressbook[i].mobile;
        lblMobile.title = "Mobile number";
        div.appendChild(lblMobile);

        if (addressbook[i].mobexe != "--" && addressbook[i].mobexe != "") {
            let lblMobexe = document.createElement("div");
            lblMobexe.innerHTML = addressbook[i].mobexe;
            lblMobexe.title = "Mobile extention";
            div.appendChild(lblMobexe);
        }

        count++;

        div.onclick = function(e) {
            if (isIE) return;

            let disable = document.createElement("div");
            disable.className = "disable";
            document.body.appendChild(disable);
            
            if (viewas == "card") {
                div.style.opacity = "0";
                div.style.transform = "scale(2) rotateY(90deg)";
            }
            
            let close = document.createElement("div");
            close.className = "closebox";
            close.innerHTML = "&#10006;";
            disable.appendChild(close);

            let dialog = document.createElement("div");
            dialog.className = "dialog";
            dialog.style.transform = "scale(.5) rotateY(-90deg)";
            disable.appendChild(dialog);

            let lblTitle = document.createElement("div");
            lblTitle.innerHTML = (addressbook[i].title == "")? "--" : addressbook[i].title;
            dialog.appendChild(lblTitle);

            let lblName = document.createElement("div");
            lblName.innerHTML = addressbook[i].firstname + " " + addressbook[i].lastname;
            dialog.appendChild(lblName);

            let lblDeparment = document.createElement("div");
            lblDeparment.innerHTML = addressbook[i].deparment;
            dialog.appendChild(lblDeparment);

            let lblEmail = document.createElement((addressbook[i].email != "")? "a" : "div");
            if (addressbook[i].email != "") lblEmail.href = "mailto:" + addressbook[i].email;
            lblEmail.innerHTML = addressbook[i].email;
            dialog.appendChild(lblEmail);

            let lblPhone = document.createElement((addressbook[i].phone != "")? "a" : "div");
            if (addressbook[i].phone != "") lblPhone.href = "tel:" + addressbook[i].phone;
            lblPhone.innerHTML = addressbook[i].phone;
            lblPhone.title = "Phone number";
            dialog.appendChild(lblPhone);

            let lblMobile = document.createElement((addressbook[i].mobile != "")? "a" : "div");
            if (addressbook[i].mobile != "") lblMobile.href = "tel:" + addressbook[i].mobile;
            lblMobile.innerHTML = addressbook[i].mobile;
            lblMobile.title = "Mobile number";
            dialog.appendChild(lblMobile);

            if (addressbook[i].mobexe != "--" && addressbook[i].mobexe != "") {
                let lblMobexe = document.createElement((addressbook[i].mobexe != "")? "a" : "div");
                if (addressbook[i].mobexe != "") lblMobexe.href = "tel:" + addressbook[i].mobexe;
                lblMobexe.innerHTML = addressbook[i].mobexe;
                lblMobexe.title = "Mobile extention";
                dialog.appendChild(lblMobexe);
            }

            setTimeout(function() { dialog.style.transform="none"; }, 20);

            disable.onclick = function() {
                dialog.style.transform = "scale(.5) rotateY(-90deg)";
                div.style.opacity = "1";
                div.style.transform = "none";

                disable.style.opacity = "0";
                setTimeout(function(){
                    if (disable.parentNode === document.body) { document.body.removeChild(disable); }
                }, 200);
            };
            
            dialog.onclick = function(e) { e.stopPropagation(); };
        };
    }
}

function GetBook() {
    let xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {

        if (xhr.readyState == 0) //request not initialized
            txtSearch.style.boxShadow = "inset 0 2px 6px rgba(96,96,96,.5), inset 450px 0 12px -8px rgba(255,0,0,.8)";

         else if (xhr.readyState == 1) { //connection established
            txtSearch.style.boxShadow = "inset 0 2px 6px rgba(96,96,96,.5), inset 100px 0 12px -8px rgba(96,139,158,1)";
            txtSearch.placeholder = "";

        } else if (xhr.readyState == 2)  //request received
            txtSearch.style.boxShadow = "inset 0 2px 6px rgba(96,96,96,.5), inset 200px 0 12px -8px rgba(96,139,158,1)";

        else if (xhr.readyState == 3)  //processing request
            txtSearch.style.boxShadow = "inset 0 2px 6px rgba(96,96,96,.5), inset 300px 0 12px -8px rgba(96,139,158,1)";

        else if (xhr.readyState == 4)  //request finished and response is ready
            txtSearch.style.boxShadow = "inset 0 2px 6px rgba(96,96,96,.5), inset 450px 0 12px -8px rgba(96,139,158,1)";
        
        if (xhr.readyState == 4) { //finish
            if (xhr.status == 200) { //OK
                setTimeout(function() {
                    txtSearch.style.boxShadow = "inset 0 2px 6px rgb(96,96,96)";
                    txtSearch.placeholder = "Search...";
                }, 500);

                addressbook = [];

                let split = xhr.responseText.split(String.fromCharCode(127));
                for (let i=0; i < split.length - 1; i+=8)
                    addressbook.push({
                        title     : split[i].toUpperCase(),
                        firstname : split[i+1],
                        lastname  : split[i+2],
                        deparment : split[i+3],
                        email     : split[i+4],
                        phone     : split[i+5],
                        mobile    : split[i+6],
                        mobexe    : split[i+7],
                        keys      : (split[i] + " " + split[i+1] + " " + split[i+2] + " " + split[i+3] + " " + split[i+4] + " " + split[i+5] + " " + split[i+6] + " " + split[i+7]).toLowerCase()
                    });

                addressbook.sort(function(a, b) {
                    if (a.title < b.title) return -1;
                    if (a.title > b.title) return 1;
                    return 0;
                });

                //Analyze(addressbook);

                Search(txtSearch.value);

            } else { //not OK
                txtSearch.style.boxShadow = "inset 0 2px 6px rgba(96,96,96,.5), inset 450px 0 12px -8px rgba(255,0,0,.8)";
                txtSearch.disabled = true;
                txtSearch.value = "Error: Fail to load address book.";
            }
        }
        
    };

	xhr.open("GET", "getaddressbook", true);
    xhr.send();
}

function Analyze(addressbook) {
    let hash = {};
    let table = [];

    for (let i=0; i < addressbook.length - 1; i++) {
        let words = [];

        let split = addressbook[i].keys.split(" ");
        for (let j=0; j<split.length; j++) {
            if (split[j].length < 3) continue;
            if (!isNaN(split[j])) continue;
            if (split[j].indexOf("@") > -1) continue;

            if (words.includes(split[j])) continue;
            words.push(split[j]);
        }


        for (let j=0; j<words.length; j++) {
            let entry;
            if (hash.hasOwnProperty(words[j])) {
                entry = hash[words[j]];
            } else {
                entry = [words[j], 0];
                hash[words[j]] = entry;
                table.push(entry);
            }
            entry[1]++;
        }
    }

    table.sort((a, b) => {
        if (a[1] > b[1]) return -1;
        if (a[1] < b[1]) return 1;
        return 0;
    });

    for (let i=0; i<table.length; i++) 
        console.log(table[i][0], table[i][1]);
}