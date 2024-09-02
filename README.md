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

### Components:
  * **Protest:** The front-end and back-end workings.
  * **Protest-CacheGenerator:** A source-generator that embeds the front-end web application within the binary executable.
  * **Protest Agent:** A tool to enable the browser talk to the client's computer using a local protocol `protest://`.

### Overview:
Pro-test is a robust solution for creating and managing an inventory database of your network environment.
It leverages data collection techniques by interacting with Active Directory or performing local network scans.
The suite automatically populates the database by targeting the domain controller or specified IP ranges.

### How to use:
Pro-test is portable and self-contained, with a web interface accessible via the loopback address.

For remote access, you can set up a reverse proxy using the included `Reverse proxy` tool.
Authentication is required for requests originating from IPs other than the loopback address.
If you opt to use a different reverse proxy, ensure that the X-Real-IP header is forwarded.
If Pro-test fails to bind to the configured endpoint, it will attempt to bind to a fallback endpoint `127.0.0.1:8080`.

Pro-test operates with the access level of the user executing it. To utilize protocols such as WMI and Active Directory services, it must be run as a Network Administrator.

### Sponsor:
*[![Sponsor](https://img.shields.io/badge/Sponsor%20on%20GitHub-374046?style=for-the-badge&logo=github)](https://github.com/sponsors/veniware)*
*[![Donate](https://img.shields.io/badge/Donate-00457C?style=for-the-badge&logo=paypal)](https://www.paypal.com/paypalme/veniware)*
