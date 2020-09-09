class Gandalf extends Window {
    constructor() {
        super([64,64,64]);

        this.AddCssDependencies("gandalf.css");

        this.args = null;

        this.setTitle("Gandalf");
        this.setIcon("res/gandalf.svgz");

        this.index = 0;
        this.menuArray = [];

        this.content.classList.add("gandalf-content");

        const buttons = document.createElement("div");
        buttons.className = "gandalf-buttons";
        this.content.appendChild(buttons);

        this.btnPrevious = document.createElement("input");
        this.btnPrevious.type = "button";
        this.btnPrevious.value = "Previous";
        buttons.appendChild(this.btnPrevious);

        this.btnNext = document.createElement("input");
        this.btnNext.type = "button";
        this.btnNext.value = "Next";
        buttons.appendChild(this.btnNext);

        this.btnPrevious.onclick = () => this.Previous();
        this.btnNext.onclick = () => this.Next();

        this.InitMenus();
        this.GetEntropy();
    }

    InitMenus() {
        for (let i = 0; i < 5; i++) {
            const menu = document.createElement("div");
            menu.className = "gandalf-roll";
            menu.style.opacity = "0";
            menu.style.transform = "translate(+100%)  scale(.8)";
            menu.style.visibility = "hidden";
            this.content.appendChild(menu);
            this.menuArray.push(menu);
        }

        this.menuArray[0].style.textAlign = "center";

        {
            const logo = document.createElement("img");
            logo.style.gridArea = "1 / 2 / 6 / 2";
            logo.style.userSelect = "none";
            logo.style.userDrag = "none";
            logo.style.webkitUserDrag = "none";
            logo.width = "128";
            logo.height = "128";
            logo.src = "res/gandalf.svgz";
            this.menuArray[0].appendChild(logo);

            this.menuArray[0].appendChild(document.createElement("br"));
            this.menuArray[0].appendChild(document.createElement("br"));

            const description = document.createElement("div");
            description.innerHTML = "Gandalf is a security tool designed to help you identify users who use weak passwords. Users bellow the strength threshold will get an email notification asking them to change to a more secure password."
            description.style.display = "inline-block";
            description.style.fontSize = "large";
            description.style.maxWidth = "720px";
            this.menuArray[0].appendChild(description);

            this.menuArray[0].appendChild(document.createElement("br"));
            this.menuArray[0].appendChild(document.createElement("br"));
            this.menuArray[0].appendChild(document.createElement("br"));

            const quote = document.createElement("div");
            quote.innerHTML = "\"You should not pass.\"<br> - Gandalf"
            quote.style.fontStyle = "italic";
            quote.style.textAlign = "right";
            quote.style.fontSize = "large";
            quote.style.maxWidth = "720px";
            this.menuArray[0].appendChild(quote);
        }

        {
            const lblThreshold = document.createElement("div");
            lblThreshold.innerHTML = "Entropy threshold:";
            lblThreshold.style.display = "inline-block";
            lblThreshold.style.fontWeight = "600";
            lblThreshold.style.minWidth = "150px";
            this.menuArray[1].appendChild(lblThreshold);

            this.rngThreshold = document.createElement("input");
            this.rngThreshold.type = "range";
            this.rngThreshold.min = 10;
            this.rngThreshold.max = 150;
            this.rngThreshold.value = 75;
            this.rngThreshold.style.width = "200px";
            this.menuArray[1].appendChild(this.rngThreshold);

            const lblThresholdValue = document.createElement("div");
            lblThresholdValue.innerHTML = "75-bits";
            lblThresholdValue.style.display = "inline-block";
            lblThresholdValue.style.paddingLeft = "8px";
            this.menuArray[1].appendChild(lblThresholdValue);

            this.menuArray[1].appendChild(document.createElement("br"));
            this.menuArray[1].appendChild(document.createElement("br"));

            const lblTotal = document.createElement("div");
            lblTotal.innerHTML = "Total users:";
            lblTotal.style.display = "inline-block";
            lblTotal.style.fontWeight = "600";
            lblTotal.style.minWidth = "150px";
            this.menuArray[1].appendChild(lblTotal);

            const lblTotalValue = document.createElement("div");
            lblTotalValue.innerHTML = "0";
            lblTotalValue.style.display = "inline-block";
            this.menuArray[1].appendChild(lblTotalValue);

            this.menuArray[1].appendChild(document.createElement("br"));
            this.menuArray[1].appendChild(document.createElement("br"));

            const lblInclude = document.createElement("div");
            lblInclude.innerHTML = "Include:";
            lblInclude.style.display = "inline-block";
            lblInclude.style.fontWeight = "600";
            lblInclude.style.minWidth = "150px";
            this.menuArray[1].appendChild(lblInclude);


            let parameters = new Set();
            for (let i = 0; i < db_users.length; i++)
                for (let k in db_users[i])
                    if (k.indexOf("PASSWORD") > -1 && !parameters.has(k))
                        parameters.add(k);

            for (let i = 0; i < parameters.length; i++) {
                const div = document.createElement("div");
                this.menuArray[1].appendChild(div);

                const chkInclude = document.createElement("input");
                chkInclude.type = "checkbox";
                div.appendChild(chkInclude);

                this.AddCheckBoxLabel(div, chkInclude, parameters[i]).style.fontWeight = "600";
            }


            this.rngThreshold.oninput =
            this.rngThreshold.onchange = () => {
                lblThresholdValue.innerHTML = `${this.rngThreshold.value}-bits`;

                if (this.entropy) {
                    let sum = this.entropy.reduce((a, b) => a + b, 0);
                    lblTotalValue.innerHTML = sum;
                }
            };

            this.rngThreshold.onchange();
        }

        this.menuArray[0].style.opacity = "1";
        this.menuArray[0].style.transform = "none";
        this.menuArray[0].style.animation = "fromRight .4s 1";
        this.menuArray[0].style.visibility = "visible";
        this.btnPrevious.setAttribute("disabled", true);
    }

    GetEntropy() {
        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200) {

                let split = xhr.responseText.split(String.fromCharCode(127));
                this.entropy = [];

                for (let i = 0; i < split.length - 2; i += 5) {
                    if (split[i] !== "u") continue;

                    let dbEntry = db_users.find(e => e[".FILENAME"][0] === split[i + 1]);
                    if (!dbEntry) continue
                    if (!dbEntry.hasOwnProperty("E-MAIL")) continue;

                    this.entropy.push({
                        file: split[i+1],
                        name: split[i+2],
                        entropy: parseFloat(split[i+3]),
                        email: dbEntry["E-MAIL"][0]
                    });
                }

                this.rngThreshold.onchange();

            } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true).addEventListener("click", ()=> this.Close());
        };
        xhr.open("GET", "db/getentropy", true);
        xhr.send();
    }

    Previous() {
        if (this.index === 0) return;

        this.menuArray[this.index].style.opacity = "0";
        this.menuArray[this.index].style.transform = "translate(+100%) scale(.8)";
        this.menuArray[this.index].style.visibility = "hidden";
        this.menuArray[this.index].style.zIndex = 0;

        this.index--;

        this.menuArray[this.index].style.opacity = "1";
        this.menuArray[this.index].style.transform = "none";
        this.menuArray[this.index].style.animation = "fromRight .4s 1";
        this.menuArray[this.index].style.visibility = "visible";
        this.menuArray[this.index].style.zIndex = 1;

        this.btnNext.removeAttribute("disabled");    

        if (this.index === 0) 
            this.btnPrevious.setAttribute("disabled", true);        
    }

    Next() {
        if (this.index === this.menuArray.length - 1) return;

        this.menuArray[this.index].style.opacity = "0";
        this.menuArray[this.index].style.transform = "translate(-100%) scale(.8)";
        this.menuArray[this.index].style.visibility = "hidden";
        this.menuArray[this.index].style.zIndex = 0;
        this.index++;

        this.menuArray[this.index].style.opacity = "1";
        this.menuArray[this.index].style.transform = "none";
        this.menuArray[this.index].style.animation = "fromLeft .4s 1";
        this.menuArray[this.index].style.visibility = "visible";
        this.menuArray[this.index].style.zIndex = 1;

        this.btnPrevious.removeAttribute("disabled");

        if (this.index === this.menuArray.length - 1) 
            this.btnNext.setAttribute("disabled", true);        
    }

}