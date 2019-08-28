class Passgen extends Window {
    constructor() {
        super();

        this.setTitle("Password generator");
        this.setIcon("res/passgen.svgz");

        this.content.style.padding = "32px 16px 0 16px";
        this.content.style.overflowY = "auto";
        this.content.style.textAlign = "center";

        this.txtPassword = document.createElement("input");
        this.txtPassword.type = "text";
        this.txtPassword.maxLength = "64";
        this.txtPassword.style.fontSize = "larger";
        this.txtPassword.style.width = "60%";
        this.txtPassword.style.maxWidth = "720px";
        this.txtPassword.style.margin = "2px calc(20% - 32px)";
        this.content.appendChild(this.txtPassword);

        this.divStrength = document.createElement("div");
        this.divStrength.style.marginTop = "4px";
        this.content.appendChild(this.divStrength);

        let divOptions = document.createElement("div");
        divOptions.style.textAlign = "left";
        divOptions.style.display = "inline-block";
        divOptions.style.marginTop = "24px";
        divOptions.style.width = "100%";
        divOptions.style.maxWidth = "400px";
        this.content.appendChild(divOptions);

        let divLength = document.createElement("div");
        divLength.style.float = "left";
        divLength.style.width = "300px";
        divLength.style.height = "100px";
        divOptions.appendChild(divLength);

        let divPool = document.createElement("div");
        divPool.style.float = "left";
        divPool.style.width = "50px";
        divPool.style.height = "100px";
        divOptions.appendChild(divPool);

        let divButtons = document.createElement("div");
        divButtons.style.width = "100%";
        divButtons.style.textAlign = "center";
        divButtons.style.paddingTop = "32px";
        divOptions.appendChild(divButtons);

        this.divBar = document.createElement("div");
        this.divBar.className = "passwors-strength-bar";
        this.divBar.style.display = "inline-block";
        this.divBar.style.width = "40px";
        this.divBar.style.height = "12px";
        this.divBar.style.transition = "box-shadow .2s";
        this.divStrength.appendChild(this.divBar);

        this.lblComment = document.createElement("div");
        this.lblComment.style.display = "inline-block";
        this.lblComment.style.minWidth = "40px";
        this.lblComment.style.textAlign = "left";
        this.lblComment.style.marginLeft = "8px";
        this.lblComment.style.marginTop = "0px";
        this.divStrength.appendChild(this.lblComment);


        let lblLength = document.createElement("div");
        lblLength.style.textDecoration = "underline";
        lblLength.style.width = "100%";
        lblLength.style.marginBottom = "4px";
        lblLength.innerHTML = "Length:";
        divLength.appendChild(lblLength);

        this.rngLength = document.createElement("input");
        this.rngLength.type = "range";
        this.rngLength.min = "6";
        this.rngLength.max = this.txtPassword.maxLength;
        this.rngLength.value = "16";
        this.rngLength.style.width = "200px";
        this.rngLength.style.float = "left";
        this.rngLength.style.marginTop = "8px";
        this.rngLength.style.marginRight = "8px";
        divLength.appendChild(this.rngLength);

        let txtLength = document.createElement("input");
        txtLength.type = "number";
        txtLength.min = this.rngLength.min;
        txtLength.max = this.txtPassword.maxLength;
        txtLength.value = this.rngLength.value;
        txtLength.style.width = "48px";
        divLength.appendChild(txtLength);

        this.chkLowercase = document.createElement("input");
        this.chkLowercase.type = "checkbox";
        this.chkLowercase.checked = true;
        divPool.appendChild(this.chkLowercase);
        this.AddCheckBoxLabel(divPool, this.chkLowercase, "Lowercase");

        this.chkUppercase = document.createElement("input");
        this.chkUppercase.type = "checkbox";
        this.chkUppercase.checked = true;
        divPool.appendChild(this.chkUppercase);
        this.AddCheckBoxLabel(divPool, this.chkUppercase, "Uppercase");

        this.chkNumbers = document.createElement("input");
        this.chkNumbers.type = "checkbox";
        this.chkNumbers.checked = true;
        divPool.appendChild(this.chkNumbers);
        this.AddCheckBoxLabel(divPool, this.chkNumbers, "Numbers");

        this.chkSymbols = document.createElement("input");
        this.chkSymbols.type = "checkbox";
        this.chkSymbols.checked = false;
        divPool.appendChild(this.chkSymbols);
        this.AddCheckBoxLabel(divPool, this.chkSymbols, "Symbols");

        this.rngLength.oninput = () => {
            txtLength.value = this.rngLength.value;
            this.Generate();
        };

        txtLength.oninput = () => {
            this.rngLength.value = txtLength.value;
            this.Generate();
        };

        let btnGenerate = document.createElement("input");
        btnGenerate.type = "button";
        btnGenerate.value = "Generate";
        divButtons.appendChild(btnGenerate);

        let btnCopy = document.createElement("input");
        btnCopy.type = "button";
        btnCopy.value = "Copy";
        divButtons.appendChild(btnCopy);

        btnGenerate.style.width = btnCopy.style.width = "96px";
        btnGenerate.style.height = btnCopy.style.height = "40px";
        btnGenerate.style.margin = btnCopy.style.margin = "2px";
        btnGenerate.style.borderRadius = "4px 0 0 4px";
        btnCopy.style.borderRadius = "0 4px 4px 0";
        
        this.chkLowercase.onchange = this.chkUppercase.onchange = this.chkNumbers.onchange = this.chkSymbols.onchange = ()=> {this.Generate();};
        
        btnGenerate.onclick = () => { this.Generate(); };

        btnCopy.onclick = () => {
            this.txtPassword.focus();
            this.txtPassword.select();
            document.execCommand("copy");
        };

        this.txtPassword.oninput = () => {
            let word = this.txtPassword.value;

            this.rngLength.value = word.length;
            txtLength.value = word.length;

            let hasUppercase = false;
            let hasLowercase = false;
            let hasNumbers = false;
            let hasSymbols = false;

            for (let i = 0; i < word.length; i++) {
                let b = word.charCodeAt(i);
                if (b > 47 && b < 58) hasNumbers = true;
                else if (b > 64 && b < 91) hasUppercase = true;
                else if (b > 96 && b < 123) hasLowercase = true;
                else hasSymbols = true;
            }

            this.chkLowercase.checked = hasLowercase;
            this.chkUppercase.checked = hasUppercase;
            this.chkNumbers.checked = hasNumbers;
            this.chkSymbols.checked = hasSymbols;


            this.Strength();
        };

        this.Generate();
    }

    Generate() {
        if (!this.chkLowercase.checked && !this.chkUppercase.checked && !this.chkNumbers.checked && !this.chkSymbols.checked)
            this.chkLowercase.checked = true;

        let pool = [];
        let flag = [];

        if (this.chkLowercase.checked) {
            pool.push("abcdefghijkmnopqrstuvwxyz");
            flag.push(false);
        }

        if (this.chkUppercase.checked) {
            pool.push("ABCDEFGHJKLMNOPQRSTUVWXYZ");
            flag.push(false);
        }

        if (this.chkSymbols.checked) {
            pool.push(" !#$%&()*+-<=>?@^_~");
            flag.push(false);
        }

        if (false) {
            pool.push("\"',./[\\]`{|}");
            flag.push(false);
        }

        if (this.chkNumbers.checked) {
            pool.push("0123456789");
            flag.push(false);
        }
        
        
        let word = "";

        for (let i = 0; i < this.rngLength.value; i++) {
            let dice = Math.round(Math.random() * (pool.length+1));
            if (dice < pool.length) {
                word += pool[dice][Math.round(Math.random() * (pool[dice].length - 1))];
                flag[dice] = true;

            } else {
                let ok = false;

                for (let j = 0; j < flag.length; j++) 
                    if (!flag[j]) {
                        word += pool[j][Math.round(Math.random() * (pool[j].length - 1))];
                        flag[j] = true;
                        ok = true;
                        break;
                    }

                if (!ok) {
                    dice = Math.round(Math.random() * (pool.length - 1));
                    word += pool[dice][Math.round(Math.random() * (pool[dice].length - 1))];
                    flag[dice] = true;
                }
            }
        }
        
        this.txtPassword.value = word;
        this.Strength();
    }

    Strength() {
        let pool = 0;
        if (this.chkNumbers.checked) pool += 10;
        if (this.chkUppercase.checked) pool += 26;
        if (this.chkLowercase.checked) pool += 26;
        if (this.chkSymbols.checked) pool += 32;

        let entropy = Math.log(Math.pow(pool, this.rngLength.value), 2);

        let strength = StrengthBar(entropy);
        let color = strength[0];
        let fill = strength[1];
        let comment = strength[2];

        this.divBar.style.boxShadow = color + " " + fill + "px 0 0 inset";
        this.lblComment.innerHTML = comment;
    }
}