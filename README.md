<p align="center"><img src="https://raw.githubusercontent.com/openprotest/protest/master/Protest/protest.png" /></p>
<h1 align="center">Pro-test</h1>
<h2 align="center">A management base for System Admins</h2>

### Continuous Integration
![build](https://img.shields.io/github/actions/workflow/status/openprotest/protest/dotnet.yml?label=Build&style=for-the-badge)
![code-analyze](https://img.shields.io/github/actions/workflow/status/openprotest/protest/codeql.yml?label=Analyze%20Back-end&style=for-the-badge)
![code-analyze](https://img.shields.io/github/actions/workflow/status/openprotest/protest/codeql-front.yml?label=Analyze%20Front-end&style=for-the-badge)

### Release
![License](https://img.shields.io/github/license/openprotest/protest?style=for-the-badge)
![Release](https://img.shields.io/github/release/openprotest/protest?style=for-the-badge)
![Commits since](https://img.shields.io/github/commits-since/openprotest/protest/latest?style=for-the-badge)
![Downloads](https://img.shields.io/github/downloads/openprotest/protest/total?style=for-the-badge)

### Platform support
![Windows](https://img.shields.io/badge/Windows-0078D6?logo=windows&style=for-the-badge)
![Linux](https://img.shields.io/badge/Linux-FCC624?logo=linux&logoColor=222&style=for-the-badge)
![MacOS](https://shields.io/badge/Mac%20OS-ccc?logo=Apple&logoColor=222&style=for-the-badge)

### This repository contains the source code for:
  * **Protest:** The front-end and back-end workings.
  * **Protest Agent:** A tool to enable the browser talk to the client's computer using a local protocol (protest://).

### Overview:
Pro-test offers a comprehensive solution for creating and managing an inventory database of your network environment.
It employs data gathering techniques through communication with Active Directory or local network scanning.
The suite automatically populates the database by targeting the domain controller or specified IP ranges.

### How to use:
Pro-test is portable and self-contained. You can access its web interface via the loopback address.
If you wish to interface from a remote host, tweak the http_ip and http_port parameters in the protest.cfg file. Requests from IPs other than loopback require authentication.
If Pro-test fails to bind to the configured endpoint, it will attempt to bind to a fallback endpoint (127.0.0.1:8080).

Pro-test inherits the access level of the user who runs it.
In order to utilizes protocols like WMI and Active Directory services, it is required to run as a Network Administrator.

### Secure proxy server basic configuration:
```
netsh http add sslcert ipport=0.0.0.0:443 certhash=[thumbprint] appid=72f5bca3-7752-45e8-8027-2060ebbda456
```

*If you use a reverse proxy (like nginx), for the authentication to work properly, you need to pass the "X-Forwarded-For" header from your proxy to the back-end.*

### Third-Party Components:
* *This product includes IP2Location LITE data available from http://www.ip2location.com.*
* *This product includes IP2Proxy LITE data available from https://www.ip2location.com/proxy-database.*

### Sponsor:
*[![Sponsor](https://img.shields.io/badge/Sponsor%20on%20GitHub-374046?style=for-the-badge&logo=github)](https://github.com/sponsors/veniware)*
*[![Donate](https://img.shields.io/badge/Donate-00457C?style=for-the-badge&logo=paypal)](https://www.paypal.com/paypalme/veniware)*
