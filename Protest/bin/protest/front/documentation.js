class Documentation extends Window {
    constructor(args) {
        super();

        this.args = args ? args : {
            keywords: ""
        };

        this.AddCssDependencies("documentation.css");

        this.setTitle("Documentation");
        this.setIcon("res/documentation.svgz");

        this.content.style.overflow = "auto";

        const sidebar = document.createElement("div");
        sidebar.className = "doc-list-pane";
        this.content.appendChild(sidebar);

        const lblSearch = document.createElement("div");
        lblSearch.style.gridArea = "1 / 1";
        lblSearch.innerHTML = "Search:";
        sidebar.appendChild(lblSearch);

        this.txtSearch = document.createElement("input");
        this.txtSearch.style.gridArea = "1 / 2";
        this.txtSearch.type = "search";
        this.txtSearch.value = this.args.keywords;
        sidebar.appendChild(this.txtSearch);

        this.list = document.createElement("div");
        this.list.className = "no-entries";
        this.list.style.backgroundColor = "var(--pane-color)";
        this.list.style.gridArea = "3 / 1 / 4 / 3";
        this.list.style.width = "100%";
        this.list.style.height = "100%";
        this.list.style.borderRadius = "4px";
        this.list.style.overflowY = "scroll";
        sidebar.appendChild(this.list);

        this.options = document.createElement("div");
        this.options.className = "doc-options";
        this.content.append(this.options);

        this.btnNew = document.createElement("input");
        this.btnNew.style.backgroundImage = "url(res/new_user.svgz)";
        this.btnNew.classList.add("light-button");
        this.btnNew.classList.add("light-button-withicon");
        this.btnNew.type = "button";
        this.btnNew.value = "New";
        this.options.appendChild(this.btnNew);

        this.btnEdit = document.createElement("input");
        this.btnEdit.style.backgroundImage = "url(res/change.svgz)";
        this.btnEdit.classList.add("light-button");
        this.btnEdit.classList.add("light-button-withicon");
        this.btnEdit.type = "button";
        this.btnEdit.value = "Edit";
        this.options.appendChild(this.btnEdit);

        this.btnDelete = document.createElement("input");
        this.btnDelete.style.backgroundImage = "url(res/delete.svgz)";
        this.btnDelete.classList.add("light-button");
        this.btnDelete.classList.add("light-button-withicon");
        this.btnDelete.type = "button";
        this.btnDelete.value = "Delete";
        this.options.appendChild(this.btnDelete);

        this.body = document.createElement("div");
        this.body.className = "doc-body-outer";
        
        this.content.append(this.body);

        this.lblTitle = document.createElement("div");
        this.lblTitle.innerHTML = "Title:";
        this.lblTitle.className = "lblTitle";
        this.body.appendChild(this.lblTitle);
        this.txtTitle = document.createElement("input");
        this.txtTitle.type = "text";
        this.txtTitle.className = "txtTitle";
        this.body.appendChild(this.txtTitle);

        this.body.appendChild(document.createElement("br"));

        this.lblError = document.createElement("div");
        this.lblError.innerHTML = "Error message/code:";
        this.lblError.className = "lblError";
        this.body.appendChild(this.lblError);
        this.txtError = document.createElement("input");
        this.txtError.type = "text";
        this.txtError.className = "txtError";
        this.body.appendChild(this.txtError);

        this.lblRelated = document.createElement("div");
        this.lblRelated.innerHTML = "Related devices:";
        this.lblRelated.className = "lblRelated";
        this.body.appendChild(this.lblRelated);
        this.divRelated = document.createElement("div");
        this.divRelated.className = "divRelated";
        this.body.appendChild(this.divRelated);

        this.body.appendChild(document.createElement("br"));

        this.btnAddRelated = document.createElement("input");
        this.btnAddRelated.type = "button";
        this.btnAddRelated.classList.add("light-button");
        this.btnAddRelated.style.backgroundImage = "url(res/new_equip.svgz)";
        this.btnAddRelated.style.right = "4px";
        this.btnAddRelated.style.top = "88px";
        this.btnAddRelated.style.minWidth = "32px";
        this.btnAddRelated.style.width = "32px";
        this.btnAddRelated.style.height = "32px";
        this.btnAddRelated.style.borderRadius = "0 8px 8px 0";
        this.btnAddRelated.style.backgroundRepeat = "no-repeat";
        this.btnAddRelated.style.backgroundSize = "28px 28px";
        this.btnAddRelated.style.backgroundPosition = "center center";

        this.body.appendChild(this.btnAddRelated);

        const divContentContainer = document.createElement("div");
        divContentContainer.className = "divContentContainer";
        this.body.appendChild(divContentContainer);

        this.divContent = document.createElement("div");
        this.divContent.setAttribute("contenteditable", true);
        this.divContent.style.width = "100%";
        this.divContent.style.minHeight = "100%";
        this.divContent.style.outline = "none";
        divContentContainer.appendChild(this.divContent);

        this.btnBold = document.createElement("button");
        this.btnBold.classList.add("light-button");
        this.btnBold.classList.add("doc-edit-button");
        this.btnBold.style.backgroundImage = "url(res/bold.svg)";
        this.btnBold.style.left = "0px";
        this.body.appendChild(this.btnBold);

        this.btnItalic = document.createElement("button");
        this.btnItalic.classList.add("light-button");
        this.btnItalic.classList.add("doc-edit-button");
        this.btnItalic.style.backgroundImage = "url(res/italic.svg)";
        this.btnItalic.style.left = "36px";
        this.body.appendChild(this.btnItalic);

        this.btnUnderline = document.createElement("button");
        this.btnUnderline.classList.add("light-button");
        this.btnUnderline.classList.add("doc-edit-button");
        this.btnUnderline.style.backgroundImage = "url(res/underline.svg)";
        this.btnUnderline.style.left = "72px";
        this.body.appendChild(this.btnUnderline);

        this.btnOList = document.createElement("button");
        this.btnOList.classList.add("light-button");
        this.btnOList.classList.add("doc-edit-button");
        this.btnOList.style.backgroundImage = "url(res/orderedlist.svg)";
        this.btnOList.style.left = "108px";
        this.body.appendChild(this.btnOList);

        this.btnUList = document.createElement("button");
        this.btnUList.classList.add("light-button");
        this.btnUList.classList.add("doc-edit-button");
        this.btnUList.style.backgroundImage = "url(res/unorderedlist.svg)";
        this.btnUList.style.left = "144px";
        this.body.appendChild(this.btnUList);

        this.btnCode = document.createElement("button");
        this.btnCode.classList.add("light-button");
        this.btnCode.classList.add("doc-edit-button");
        this.btnCode.style.backgroundImage = "url(res/code.svg)";
        this.btnCode.style.left = "180px";
        this.body.appendChild(this.btnCode);

        this.btnLink = document.createElement("button");
        this.btnLink.classList.add("light-button");
        this.btnLink.classList.add("doc-edit-button");
        this.btnLink.style.backgroundImage = "url(res/link.svg)";
        this.btnLink.style.left = "216px";
        this.body.appendChild(this.btnLink);

        this.txtSearch.onchange = () => this.UpdateList();

        this.btnBold.onclick = ()      => { document.execCommand("bold", false, null); };
        this.btnItalic.onclick = ()    => { document.execCommand("italic", false, null); };
        this.btnUnderline.onclick = () => { document.execCommand("underline", false, null); };
        this.btnOList.onclick = ()     => { document.execCommand("insertOrderedList", false, null); };
        this.btnUList.onclick = () => { document.execCommand("insertUnorderedList", false, null); };

        this.btnCode.onclick = () => {
            let sel, range;
            if (window.getSelection && (sel = window.getSelection()).rangeCount) {
                range = sel.getRangeAt(0);
                if (range.startContainer.className != "") return;

                var div = document.createElement("div");
                div.className = "doc-code";
                range.insertNode(div);
                range.setStart(div, 0);

                sel.removeAllRanges();
                sel.addRange(range);
            }
        };

        this.btnLink.onclick = () => {
            let link = prompt("Enter a link:", "https://");
            if (link != null) document.execCommand("createLink", false, link);
        };

        setTimeout(() => { this.AfterResize(); }, 200);

        this.SetNewDoc();
    }

    AfterResize() { //override
        super.AfterResize();
        if (this.options.getBoundingClientRect().width < 260)
            this.options.classList.add("doc-options-collapsed");
        else
            this.options.classList.remove("doc-options-collapsed");
    }

    UpdateList() {
        this.args = {
            keywords: this.txtSearch.value,
        };
    }


    SetNewDoc() {
        this.divContent.innerHTML = "";

        const desc = document.createElement("div");
        desc.innerHTML = "Description:";
        //desc.style.fontSize = "large";
        desc.style.fontWeight = 600;
        desc.style.textDecoration = "underline";
        this.divContent.appendChild(desc);

        this.divContent.appendChild(document.createElement("br"));
        this.divContent.appendChild(document.createElement("br"));
        this.divContent.appendChild(document.createElement("br"));

        const solution = document.createElement("div");
        solution.innerHTML = "Solution:";
        //solution.style.fontSize = "large";
        solution.style.fontWeight = 600;
        solution.style.textDecoration = "underline";
        this.divContent.appendChild(solution);

        this.divContent.appendChild(document.createElement("br"));
        this.divContent.appendChild(document.createElement("br"));
        this.divContent.appendChild(document.createElement("br"));
    }

}