class DevicesGrid extends Grid {
	constructor(params) {
		super(LOADER.devices.data);

		this.SetTitle("Devices grid view");
		this.SetIcon("mono/griddevices.svg");
	}
}