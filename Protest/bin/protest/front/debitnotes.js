class DebitNotes extends Window {
    constructor(args) {
        super();

        this.args = args ? args : { };

        this.AddCssDependencies("debitnotes.css");

        this.setTitle("Debit notes");
        this.setIcon("res/charges.svgz");

        this.content.style.overflow = "auto";

        const listbox = document.createElement("div");
        listbox.style.display = "grid";
        listbox.style.gridTemplateColumns = "72px 200px auto";
        listbox.style.gridTemplateRows = "repeat(3, 32px) 8px repeat(3, 28px) auto 8px";
        listbox.style.alignItems = "baseline";

        listbox.className = "debit-list-pane";
        this.content.appendChild(listbox);

        const lblSearch = document.createElement("div");
        lblSearch.style.gridArea = "1 / 1";
        lblSearch.innerHTML = "Search:";
        listbox.appendChild(lblSearch);

        this.txtSearch = document.createElement("input");
        this.txtSearch.style.gridArea = "1 / 2";
        this.txtSearch.type = "search";
        listbox.appendChild(this.txtSearch);

        const lblFrom = document.createElement("div");
        lblFrom.style.gridArea = "2 / 1";
        lblFrom.innerHTML = "From:";
        listbox.appendChild(lblFrom);

        this.dateFrom = document.createElement("input");
        this.dateFrom.style.gridArea = "2 / 2";
        this.dateFrom.type = "date";
        listbox.appendChild(this.dateFrom);

        const lblTo = document.createElement("div");
        lblTo.style.gridArea = "3 / 1";
        lblTo.innerHTML = "To:";
        listbox.appendChild(lblTo);

        this.dateTo = document.createElement("input");
        this.dateTo.style.gridArea = "3 / 2";
        this.dateTo.type = "date";
        listbox.appendChild(this.dateTo);


        const lblFilter = document.createElement("div");
        lblFilter.style.gridArea = "5 / 1";
        lblFilter.innerHTML = "Filters:";
        listbox.appendChild(lblFilter);


        const divShort = document.createElement("div");
        divShort.style.gridArea = "5 / 2";
        divShort.style.paddingLeft = "4px";
        listbox.appendChild(divShort);
        this.chkShort = document.createElement("input");
        this.chkShort.type = "checkbox";
        this.chkShort.checked = true;
        divShort.appendChild(this.chkShort);
        this.AddCheckBoxLabel(divShort, this.chkShort, "Short-pending");

        const divLong = document.createElement("div");
        divLong.style.gridArea = "6 / 2";
        divLong.style.paddingLeft = "4px";
        listbox.appendChild(divLong);
        this.chkLong = document.createElement("input");
        this.chkLong.type = "checkbox";
        this.chkLong.checked = false;
        divLong.appendChild(this.chkLong);
        this.AddCheckBoxLabel(divLong, this.chkLong, "Long-pending");

        const divReturned = document.createElement("div");
        divReturned.style.gridArea = "7 / 2";
        divReturned.style.paddingLeft = "4px";
        listbox.appendChild(divReturned);
        this.chkReturned = document.createElement("input");
        this.chkReturned.type = "checkbox";
        this.chkReturned.checked = false;
        divReturned.appendChild(this.chkReturned);
        this.AddCheckBoxLabel(divReturned, this.chkReturned, "Returned");

        this.list = document.createElement("div");
        this.list.className = "no-entries";
        this.list.style.backgroundColor = "var(--pane-color)";
        this.list.style.gridArea = "8 / 1 / 9 / 3";
        this.list.style.width = "100%";
        this.list.style.height = "100%";
        this.list.style.borderRadius = "4px";
        this.list.style.overflowY = "scroll";
        listbox.appendChild(this.list);

        const now = new Date();
        const gap = new Date(now - 86400000 * 365);
        this.dateFrom.value = `${gap.getFullYear()}-${(gap.getMonth()+1).toString().padStart(2,"0")}-${(gap.getDate().toString().padStart(2,"0"))}`;
        this.dateTo.value = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,"0")}-${(now.getDate().toString().padStart(2,"0"))}`;

        this.GetNotes();
    }

    GetNotes() {
        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4 && xhr.status == 200) {

            } else if (xhr.readyState == 4 && xhr.status == 0) //disconnected
                this.ConfirmBox("Server is unavailable.", true);
        };
        xhr.open("GET", "getdebitnotes", true);
        xhr.send();
    }

}