# Pro-test
## A management base for System Admins.

![GitHub](https://img.shields.io/github/license/veniware/openprotest)
![GitHub All Releases](https://img.shields.io/github/downloads/veniware/openprotest/total)
![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/veniware/openprotest)
![GitHub Release Date](https://img.shields.io/github/release-date/veniware/openprotest)
![GitHub commits since latest release](https://img.shields.io/github/commits-since/veniware/openprotest/latest)

### Platform support
![Windows](https://img.shields.io/badge/Windows-0078D6?style=&logo=windows)
![Linux](https://img.shields.io/badge/Linux-FCC624?style=&logo=linux&logoColor=black)
![MacOs](https://shields.io/badge/MacOS--9cf?logo=Apple&style=social)

### This repository contains the source code for:
  * **Protest:** Front-end interface and back-end application.
  * **Protest Agent:** Tool to enable communication between the server and clients, via a local protocol (protest://).

### Overview:
Pro-test offers a comprehensive solution for creating and managing an inventory database of your network environment.
It employs data gathering techniques through communication with Active Directory or local network scanning.
The suite automatically populates the database by targeting the domain controller or specified IP ranges.

### How to use:
Pro-test is portable and self-contained. You can access its web interface via the loopback address.
If you wish to interface from a remote host, tweak the http_ip and http_port parameters in the protest.cfg file. Requests from IPs other than loopback require authentication.
If Pro-test fails to bind to the configured endpoint, it will try to bind the a fallback endpoint (127.0.0.1:8080).

Pro-test inherets the access level of the user who runs it.
In order to utilizes protocols like WMI and Active Directory services, it is required to run as a Network Administrator.

If you use a reverse proxy, for the authentication to work properly, you need to pass the "X-Forwarded-For" header from your proxy to the back-end.


* *This product includes IP2Location LITE data available from http://www.ip2location.com.*
* *This product includes IP2Proxy LITE data available from https://www.ip2location.com/proxy-database.*

### Make a donation
*[![paypal](https://img.shields.io/badge/PayPal-00457C?style=for-the-badge&logo=paypal)](https://www.paypal.com/paypalme/veniware/25)*
