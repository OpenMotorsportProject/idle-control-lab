# Security

Idle Control Lab is an offline educational simulator. It runs synthetic engine and spring models with local browser settings. The desktop shell serves an embedded list of resources. Its two publication links open in the system browser.

Please report security issues privately to the project maintainers through the release host's private security reporting facility when available. Include the version or commit, operating system, WebView version, whether you used the native or browser edition, and minimal reproduction steps. Omit credentials or personal engine logs.

## Dependency review

The Linux desktop uses the GTK 3 stack required by the pinned Tao/Wry versions. Its transitive GLib 0.18.5 dependency carries [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html) for string-variant iteration. The application does not directly use this iterator. The fixed GLib 0.20 series is outside GTK 3's constraints. The build-time `proc-macro-error` dependency also carries [RUSTSEC-2024-0370](https://rustsec.org/advisories/RUSTSEC-2024-0370.html) for lack of maintenance. Re-evaluate both advisories when updating the WebView stack. Linux users can run the standalone browser edition independently of GTK bindings in the native executable.

For each release, run `cargo audit` on the locked workspace, scan the source and the intended distribution for secrets and private build paths, and run the platform checks in the README. Keep the system WebView runtime updated.
