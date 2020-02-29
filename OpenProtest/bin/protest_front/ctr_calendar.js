var CAL_MONTHS_MAP = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];


class Calendar {

    constructor() {
        if (document.head.querySelectorAll("link[href$='calendar.css']").length == 0) {
            let csslink = document.createElement("link");
            csslink.rel = "stylesheet";
            csslink.href = "calendar.css";
            document.head.appendChild(csslink);
        }

        let now = new Date();
        this.date = now.getDate();
        this.month = now.getMonth(); //0-11
        this.year = now.getFullYear();

        this.header = document.createElement("div");
        this.calendar = document.createElement("div");

        this.btnPrev = document.createElement("div");
        this.btnPrev.innerHTML = "&#9664;";
        this.header.appendChild(this.btnPrev);

        this.btnNext = document.createElement("div");
        this.btnNext.innerHTML = "&#9654;";
        this.header.appendChild(this.btnNext);

        this.lblMonth = document.createElement("div");
        this.lblMonth.innerHTML = "";
        this.header.appendChild(this.lblMonth);

        this.isCollapsed = false;
        this.selected = null;
        this.showToday = true;
        this.showPast = false;

        this.header.className = "cal-header";
        this.calendar.className = "calendar";

        this.btnPrev.onclick = ()=> { this.PreviewsMonth(); };
        this.btnNext.onclick = () => { this.NextMonth(); };

        this.days = document.createElement("div");
        this.days.className = "cal-days";

        let daylist = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
        for (let i = 0; i < daylist.length; i++) {
            let newDayLabel = document.createElement("div");
            newDayLabel.innerHTML = daylist[i];
            this.days.appendChild(newDayLabel);
        }
    }

    Attach(container) {
        container.appendChild(this.header);
        container.appendChild(this.days);
        container.appendChild(this.calendar);
        this.Build();
    }

    Build() {
        let now = new Date();

        if (now.getFullYear() != this.year)
            this.lblMonth.innerHTML = CAL_MONTHS_MAP[this.month] + " (" + this.year + ")";
        else
            this.lblMonth.innerHTML = CAL_MONTHS_MAP[this.month];

        while (this.calendar.children.length > 0)
            this.calendar.removeChild(this.calendar.firstChild);

        let week = 0;
        let lenMonth = new Date(this.year, this.month + 1, 0).getDate(); //+1
        let day = new Date(this.year, this.month, 0).getDay();
        day = day % 7;

        for (let i=1; i<lenMonth+1; i++) {
            let newDay = document.createElement("div");
            newDay.style.left = "calc(4px + " + day * 14.285 + "%)";
            newDay.style.top = 2 + week * 32 + "px";
            newDay.style.animationDuration = .02 * i + "s";
            newDay.innerHTML = i;
            newDay.value = i;
            this.calendar.appendChild(newDay);

            if (this.showToday && this.year == now.getFullYear() && this.month == now.getMonth() && i == now.getDate()) { //today
                newDay.style.backgroundColor = "var(--theme-color)";
            }

            if (this.selected != null && this.year == this.selected.getFullYear() && this.month == this.selected.getMonth() && i == this.selected.getDate()) { //selected
                newDay.style.boxShadow = "var(--theme-color) 0 0 0px 3px inset";
                newDay.style.borderRadius = "4px";
            }

            newDay.onclick = event=> {
                for (let j = 0; j < this.calendar.children.length; j++) {
                    this.calendar.children[j].style.boxShadow = "none";
                    this.calendar.children[j].style.borderRadius = "50%";
                }

                this.selected = new Date(this.year, this.month, event.target.value);

                event.target.style.boxShadow = "var(--theme-color) 0 0 0px 3px inset";
                event.target.style.borderRadius = "4px";

                this.onchange();
            };

            if (++day > 6) {
                day = day % 7;
                week++;
            }
        }

    }

    GoTo(year, month, date) {
        this.date = date;
        this.month = month;
        this.year = year;
        this.Build();
    }

    PreviewsMonth() {
        this.month--;
        if (this.month < 0) {
            this.month = 11;
            this.year--;
        }

        this.GoTo(this.year, this.month, 0);
    }

    NextMonth() {
        this.month++;
        if (this.month > 11) {
            this.month = 0;
            this.year++;
        }

        this.GoTo(this.year, this.month, 0);
    }

    GetDate() {
        if (this.selected === null) return null;
        return this.selected;
    }

    ClearSelection() {
        this.selected = null;
        this.Build();
    }

    onchange(arg) { } //overridable
}