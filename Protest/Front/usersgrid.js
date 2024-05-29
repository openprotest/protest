class UsersGrid extends Grid {
	constructor() {
		super(LOADER.users.data);

		this.SetTitle("Users grid view");
		this.SetIcon("mono/gridusers.svg");
	}
}