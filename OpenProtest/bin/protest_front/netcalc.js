class Netcalc extends Window {
    constructor() {
        super();

        this.setTitle("Network calculator");
        this.setIcon("res/netcalc.svgz");

        this.content.style.overflow = "auto";
        this.content.style.padding = "16px";
        this.content.style.display = "grid";
        this.content.style.gridTemplateColumns = "192px 72px 192px 96px";
        this.content.style.gridTemplateRows = "repeat(8, 32px)";
        this.content.style.alignItems = "end";
        
        let lblAddress = document.createElement("div");
        lblAddress.innerHTML = "IP address:";
        lblAddress.style.gridColumn = "1";
        lblAddress.style.gridRow = "1";
        this.content.appendChild(lblAddress);

        let divAddress = document.createElement("div");
        divAddress.style.gridColumn = "1";
        divAddress.style.gridRow = "2";
        this.content.appendChild(divAddress);       
        this.ipAddress = new IpBox();
        this.ipAddress.SetIp(192, 168, 0, 0);
        this.ipAddress.Attach(divAddress);

        let lblClass = document.createElement("div");
        lblClass.innerHTML = "Class C";
        lblClass.style.gridColumn = "2";
        lblClass.style.gridRow = "2";
        lblClass.style.padding = "10px 0px";
        this.content.appendChild(lblClass);

        let lblMask = document.createElement("div");
        lblMask.innerHTML = "Subnet mask:";
        lblMask.style.gridColumn = "1";
        lblMask.style.gridRow = "3";
        this.content.appendChild(lblMask);

        let divMask = document.createElement("div");
        divMask.style.gridColumn = "1";
        divMask.style.gridRow = "4";
        this.content.appendChild(divMask);
        this.ipMask = new IpBox();
        this.ipMask.SetIp(255, 255, 255, 0);
        this.ipMask.Attach(divMask);

        let lblSlash = document.createElement("div");
        lblSlash.innerHTML = "/";
        lblSlash.style.display = "inline-block";
        lblSlash.style.paddingLeft = "4px";
        divMask.appendChild(lblSlash);

        let lblCIDR = document.createElement("div");
        lblCIDR.innerHTML = "CIDR:";
        lblCIDR.value = "24";
        lblCIDR.style.gridColumn = "2";
        lblCIDR.style.gridRow = "3";
        this.content.appendChild(lblCIDR);

        this.txtCIDR = document.createElement("input");
        this.txtCIDR.type = "number";
        this.txtCIDR.min = "4";
        this.txtCIDR.max = "30";
        this.txtCIDR.value = "24";
        this.txtCIDR.style.width = "40px";
        this.txtCIDR.style.marginLeft = "0px";
        this.txtCIDR.style.gridColumn = "2";
        this.txtCIDR.style.gridRow = "4";
        this.content.appendChild(this.txtCIDR);

        this.rngCIDR = document.createElement("input");
        this.rngCIDR.type = "range";
        this.rngCIDR.min = "4";
        this.rngCIDR.max = "30";
        this.rngCIDR.value = "24";
        this.rngCIDR.style.gridColumn = "3";
        this.rngCIDR.style.gridRow = "4";
        this.rngCIDR.style.margin = "10px 0";
        this.rngCIDR.style.marginLeft = "8px";
        this.content.appendChild(this.rngCIDR);
        
        this.lblSubnet = document.createElement("div");
        this.lblSubnet.innerHTML = "Subnet:<br>192.168.0.0";
        this.lblSubnet.style.gridArea = "7 / 2 / 1 / 1";
        this.lblSubnet.style.textAlign = "center";
        this.content.appendChild(this.lblSubnet);

        this.lblBroadcast = document.createElement("div");
        this.lblBroadcast.innerHTML = "Boadcast:<br>192.168.0.255";
        this.lblBroadcast.style.gridArea = "7 / 3 / 1 / auto";
        this.lblBroadcast.style.textAlign = "center";
        this.content.appendChild(this.lblBroadcast);

        this.lblRange = document.createElement("div");
        this.lblRange.innerHTML = "Host range:<br>192.168.0.1 - 192.168.0.254";
        this.lblRange.style.gridArea = "9 / 1 / 1 / 4";
        this.lblRange.style.textAlign = "center";
        this.content.appendChild(this.lblRange);

        this.lblTotal = document.createElement("div");
        this.lblTotal.innerHTML = "Hosts:<br>254";
        this.lblTotal.style.gridArea = "9 / 4 / 1 / 4";
        this.lblTotal.style.textAlign = "center";
        this.lblTotal.style.marginLeft = "8px";
        this.content.appendChild(this.lblTotal);

        this.lblSubnet.style.border = this.lblBroadcast.style.border = this.lblRange.style.border = this.lblTotal.style.border = "rgb(224,224,224) 1px solid";
        this.lblSubnet.style.borderRadius = this.lblBroadcast.style.borderRadius = this.lblRange.style.borderRadius = this.lblTotal.style.borderRadius = "4px";
        this.lblSubnet.style.userSelect = this.lblBroadcast.style.userSelect = this.lblRange.style.userSelect = this.lblTotal.style.userSelect = "text";
        this.lblSubnet.style.webkitUserSelect = this.lblBroadcast.style.webkitUserSelect = this.lblRange.style.webkitUserSelect = this.lblTotal.style.webkitUserSelect = "text";

        this.txtCIDR.oninput = () => {
            this.rngCIDR.value = this.txtCIDR.value;

            let octet = Math.floor(this.txtCIDR.value / 8);
            let value = this.txtCIDR.value % 8;

            for (let i = 0; i < octet; i++)
                this.ipMask.textBoxes[i].value = 255;

            for (let i = octet + 1; i < 4; i++)
                this.ipMask.textBoxes[i].value = 0;

            let v = 0;
            for (let i = 0; i < value; i++)
                v += Math.pow(2, 7 - i);
            this.ipMask.textBoxes[octet].value = v;

            this.Calculate();
        };

        this.rngCIDR.oninput = () => {
            this.txtCIDR.value = this.rngCIDR.value;

            let octet = Math.floor(this.rngCIDR.value / 8);
            let value = this.rngCIDR.value % 8;

            for (let i = 0; i < octet; i++)
                this.ipMask.textBoxes[i].value = 255;

            for (let i = octet+1; i < 4; i++)
                this.ipMask.textBoxes[i].value = 0;

            let v = 0;
            for (let i = 0; i < value; i++)
                v += Math.pow(2, 7-i);
            this.ipMask.textBoxes[octet].value = v;

            this.Calculate();
        };

        this.ipAddress.textBoxes[0].onkeyup = this.ipAddress.textBoxes[0].oninput =
        this.ipAddress.textBoxes[1].onkeyup = this.ipAddress.textBoxes[1].oninput =
        this.ipAddress.textBoxes[2].onkeyup = this.ipAddress.textBoxes[2].oninput =
        this.ipAddress.textBoxes[3].onkeyup = this.ipAddress.textBoxes[3].oninput = () => {
            let octet = parseInt(this.ipAddress.GetIpArray()[0]);

            if (octet > 0 && octet < 127) lblClass.innerHTML = "Class A";
            else if (octet > 127 && octet < 192) lblClass.innerHTML = "Class B";
            else if (octet >= 192 && octet < 224) lblClass.innerHTML = "Class C";
            else if (octet >= 224 && octet < 240) lblClass.innerHTML = "Class D";
            else lblClass.innerHTML = "";

            this.Calculate();
        };

        this.ipMask.textBoxes[0].onkeyup = this.ipMask.textBoxes[0].oninput =
        this.ipMask.textBoxes[1].onkeyup = this.ipMask.textBoxes[1].oninput =
        this.ipMask.textBoxes[2].onkeyup = this.ipMask.textBoxes[2].oninput =
        this.ipMask.textBoxes[3].onkeyup = this.ipMask.textBoxes[3].oninput = () => {
            let bits = parseInt(this.ipMask.textBoxes[0].value).toString(2) +
                       parseInt(this.ipMask.textBoxes[1].value).toString(2) +
                       parseInt(this.ipMask.textBoxes[2].value).toString(2) +
                       parseInt(this.ipMask.textBoxes[3].value).toString(2);

            let bitcount = 0;
            for (let i = 0; i < bits; i++) {
                if (bits[i] == "0") break;
                bitcount++;
            }

            this.rngCIDR.value = bitcount;
            this.txtCIDR.value = bitcount;

            this.Calculate();
        };

        this.Calculate();
    }

    Calculate() {
        let ip = this.ipAddress.GetIpArray();
        let mask = this.ipMask.GetIpArray();

        let net = [];
        let broadcast = [];

        for (let i = 0; i < 4; i++) {
            net.push(ip[i] & mask[i]);
            broadcast.push(ip[i] | (255-mask[i]));
        }

        this.lblSubnet.innerHTML = "Subnet:<br>" + net.join(".");
        this.lblBroadcast.innerHTML = "Boadcast:<br>" + broadcast.join(".");
        this.lblRange.innerHTML = "Host range:<br>" + net[0] + "." + net[1] + "." + net[2] + "." + (net[3] + 1) + " - " +
                                   broadcast[0] + "." + broadcast[1] + "." + broadcast[2] + "." + (broadcast[3]-1);

        this.lblTotal.innerHTML = "Hosts:<br>" + (Math.pow(2, 32-this.rngCIDR.value) - 2);
    }
}