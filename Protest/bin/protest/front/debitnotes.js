class DebitNotes extends Window {
    constructor() {
        super();

        if (this.args === null) {
            this.New();
            return;
        }

        this.setTitle("Debit notes");
        this.setIcon("res/charges.svgz");

    }

}