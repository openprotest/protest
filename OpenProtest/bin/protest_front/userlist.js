const USER_PARAM = [
"title",
"department",
"first name",
"last name",
"username", 
"e-mail",
"telephone number",
"mobile number"];

const USER_LIST_ORDER = ["TITLE", "DEPARTMENT", "FIRST NAME", "LAST NAME", "USERNAME", "E-MAIL", "TELEPHONE NUMBER", "MOBILE NUMBER"];

class UserList extends Window {
    constructor(strFind = "", strSoft = "") {
        if (document.head.querySelectorAll("link[href$='equiplist.css']").length == 0) {
            let csslink = document.createElement("link");
            csslink.rel = "stylesheet";
            csslink.href = "equiplist.css";
            document.head.appendChild(csslink);

            csslink.onload = () => { this.AfterResize(); };
        }

        super([208,208,208]);

        this.list = [];

        this.setTitle("Users");
        this.setIcon("res/database_users.svgz");  

        this.strFind   = strFind;
        this.strSort   = strSoft.toUpperCase();

        this.content.className = "content no-results";
        this.content.style.overflowY = "scroll";

        this.btnFind = document.createElement("div");
        this.btnFind.style.borderBottom = (this.strFind.length==0)? "none" : "#FF7900 solid 2px";
        this.btnFind.style.backgroundImage = "url(res/l_search.svgz)";
        this.toolbox.appendChild(this.btnFind);

        this.btnSort = document.createElement("div");
        this.btnSort.style.borderBottom = (this.strSort.length==0)? "none" : "#FF7900 solid 2px";
        this.btnSort.style.backgroundImage = "url(res/l_sort.svgz)";
        this.toolbox.appendChild(this.btnSort);

        this.txtFind = document.createElement("input");
        this.txtFind.type = "text";
        this.txtFind.placeholder = "Find...";
        this.txtFind.value = this.strFind;
        this.btnFind.appendChild(this.txtFind);

        this.pnlSort = document.createElement("div");
        this.btnSort.appendChild(this.pnlSort);

        this.btnFind.onclick = ()=> { this.txtFind.focus(); };
        this.btnSort.onmouseenter = ()=> { this.pnlSort.style.maxHeight = container.clientHeight - this.win.offsetTop - 64 + "px"; };

        this.lblTitle.style.left = TOOLBAR_GAP + this.toolbox.childNodes.length * 22 + "px";

        this.WaitLoader();

        this.btnFind.ondblclick = ()=> {
            if (this.strFind=="") return;
            this.strFind = ""; this.txtFind.value = "";
            this.DisplayList();
            this.btnFind.style.borderBottom = "none";
        };

        this.btnSort.ondblclick = ()=> {
            if (this.strSort=="") return;
            this.strSort = "";
            this.DisplayList();
            this.btnSort.style.borderBottom = "none";
        };

        this.txtFind.onchange = ()=> {
            this.strFind = this.txtFind.value;
            this.DisplayList();
            this.btnFind.style.borderBottom = (this.strFind.length==0)? "none" : "#FF7900 solid 2px";
        };

        this.content.onscroll = ()=> { this.InvalidateRecyclerList(); };
    }

    Toogle() { //override
        super.Toogle();
        setTimeout(()=>{ this.AfterResize(); }, ANIM_DURATION);
    }

    AfterResize() { //override
        this.InvalidateRecyclerList();
    }

    WaitLoader() {
        if (db_users === null) {
            if (this.content.childNodes.length == 0) {
                let lblLoading = document.createElement("div");
                lblLoading.innerHTML = "Loading...";
                lblLoading.style.textAlign  = "center";
                lblLoading.style.marginTop  = "32px";
                lblLoading.style.fontSize   = "24px";
                lblLoading.style.color      = "#888";
                this.content.appendChild(lblLoading);
            }
            setTimeout(()=> this.WaitLoader(), 200);
        } else
            this.DisplayList();
    }

    async DisplayList() {
        this.list = [];
        this.content.innerHTML = "";
        this.pnlSort.innerHTML = "";

        let keywords = [];
        if (this.strFind.length > 0)
            keywords = this.strFind.toLowerCase().split(" ");

        for (let i=0; i<db_users.length; i++) {
            if (this.strFind.length > 0) { //find
                let match = true;

                for (let j=0; j<keywords.length; j++) {
                    let flag = false;
                    for (let k in db_users[i]) {
                        //if (k.startsWith(".") && k != ".FILENAME") continue;
                        if (db_users[i][k][0].toLowerCase().indexOf(keywords[j]) > -1) 
                            flag = true;
                    }
                    if (!flag) {
                        match = false;
                        continue;
                    }
                }

                if (!match) continue;
            }
            
            this.list.push(db_users[i]);
        }
    
        //sort
        if (this.strSort.length != 0)
            this.list.sort((a,b)=> {
                if (a[this.strSort]==undefined && b[this.strSort]==undefined) return 0;
                if (a[this.strSort]==undefined) return 1;
                if (b[this.strSort]==undefined) return -1;
                if (a[this.strSort][0] < b[this.strSort][0]) return -1;
                if (a[this.strSort][0] > b[this.strSort][0]) return 1;
                return 0;
            });
        

        this.content.style.display = "none";

        for (let i=0; i<this.list.length; i++) { //display
            let element = document.createElement("div");
            element.className = "eql-element";
            element.id = "u" + this.list[i][".FILENAME"][0];
            this.content.appendChild(element);
    
            let entry = this.list[i];

            if (element.offsetTop - this.content.scrollTop > -40 && element.offsetTop - this.content.scrollTop < this.content.clientHeight)
                this.FillElement(element, entry);
        }

        this.content.style.display = "block";

        this.pnlSort.innerHTML = "";
        for (let i=0; i<USER_PARAM.length; i++) 
            if (USER_PARAM[i].length > 0) {
                let newSoft = document.createElement("div");
                newSoft.innerHTML = USER_PARAM[i];
                this.pnlSort.appendChild(newSoft);

                newSoft.onclick = event=> {
                    if (this.strSort == USER_PARAM[i]) return;
                    this.strSort = USER_PARAM[i].toUpperCase();
                    this.DisplayList();
                    this.btnSort.style.borderBottom = "#FF7900 solid 2px";
                };
            }
            
        this.InvalidateRecyclerList();
    }

    FillElement(element, entry) {
        let icon = document.createElement("div");
        icon.className = "eql-icon";
        icon.style.backgroundImage = "url(res/user.svgz)";
        element.appendChild(icon);

        for (let j=0; j<8; j++) {               
            if (!entry.hasOwnProperty(USER_LIST_ORDER[j])) continue;

            let newLabel = document.createElement("div");
            newLabel.innerHTML = entry[USER_LIST_ORDER[j]][0];
            newLabel.className = "eql-label" + j;
            element.appendChild(newLabel);
        }
        
        /*for (let k in entry)
            if (typeof entry[k] != "undefined")
                if (!USER_PARAM.includes(k.toLowerCase()) && !k.startsWith(".")) USER_PARAM.push(k.toLowerCase());*/

        element.ondblclick = (event)=> {
            for (let i=0; i<$w.array.length; i++)
                if ($w.array[i] instanceof User && $w.array[i].filename == entry[".FILENAME"][0]) {
                    $w.array[i].Minimize(); //minimize/restore
                    return;
                }

            new User(entry);
            event.stopPropagation();
        };
    }

    InvalidateRecyclerList() { //override
        for (let i=0; i<this.content.childNodes.length; i++)
            if (this.content.childNodes[i].offsetTop - this.content.scrollTop < -40 ||
                this.content.childNodes[i].offsetTop - this.content.scrollTop > this.content.clientHeight) {
                this.content.childNodes[i].innerHTML = "";
            } else {
                if (this.content.childNodes[i].childNodes.length > 0) continue;
                this.FillElement(this.content.childNodes[i], this.list[i]);
            }
    }
}