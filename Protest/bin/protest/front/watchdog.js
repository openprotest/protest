class Watchdog extends Window {
    constructor() {
        super([64,64,64]);

        this.args = null;

        this.setTitle("Watchdog");
        this.setIcon("res/watchdog.svgz");

        const list = document.createElement("div");
        list.style.position = "absolute";
        list.style.left = "8px";
        list.style.right = "8px";
        list.style.top = "40px";
        list.style.bottom = "8px";
        list.style.borderRadius = "4px";
        list.style.backgroundColor = "var(--pane-color)";
        list.style.overflowY = "scroll";
        this.content.appendChild(list);

        const divOptions = document.createElement("div");
        divOptions.style.position = "absolute";
        divOptions.style.left = "4px";
        divOptions.style.right = "128px";
        divOptions.style.top = "0";
        divOptions.style.height = "36px";
        divOptions.style.overflow = "hidden";
        this.content.appendChild(divOptions);

        const btnAdd = document.createElement("input");
        btnAdd.type = "button";
        btnAdd.value = "Add";
        btnAdd.className = "light-button light-button-withicon";
        btnAdd.style.backgroundImage = "url(res/new_user.svgz)";
        divOptions.appendChild(btnAdd);

        const btnRemove = document.createElement("input");
        btnRemove.type = "button";
        btnRemove.value = "Remove";
        btnRemove.className = "light-button light-button-withicon";
        btnRemove.style.backgroundImage = "url(res/delete.svgz)";
        divOptions.appendChild(btnRemove);

        const btnEmailSetup = document.createElement("input");
        btnEmailSetup.type = "button";
        btnEmailSetup.value = "E-mail setup";
        btnEmailSetup.className = "light-button light-button-withicon";
        btnEmailSetup.style.position = "absolute";
        btnEmailSetup.style.backgroundImage = "url(res/email.svgz)";
        btnEmailSetup.style.right = "4px";
        btnEmailSetup.style.top = "0";
        this.content.appendChild(btnEmailSetup);

    }
}