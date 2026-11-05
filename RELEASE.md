# 0.1.0 source release verification

Verified on 2026-11-05 with Rust 1.95.0. The distribution includes the illustrated manual, both offline browser entry points, the compiled browser model, the Rust workspace and the files needed to build each desktop shell.

| Target | Checks completed |
| --- | --- |
| macOS, Apple silicon | Built and launched the packaged app in WKWebView, verified the ad hoc signature, and passed workspace tests, JavaScript tests and Clippy. |
| Linux, x86-64 | Built the release executable on Debian 12 under architecture emulation. All four Rust and five JavaScript tests passed. Launched the app with WebKitGTK 2.50.6 in a virtual display and observed the running neural lab and its controls. |
| Windows, x86-64 | Checked the full workspace with the MSVC target. Cross-built the GNU release executable and ran all four Windows Rust tests under Wine 10. A native Windows WebView2 launch remains to be verified. The included Windows CI job builds with MSVC and checks that the rendered neural lab appears. |

## Security and packaging

A review of the prior version found three issues. The desktop executable could load substituted files from a nearby Resources folder, an external page could appear inside the simulator window, and compiled artifacts exposed the builder's local paths. This release embeds its simulator resources, restricts in-app navigation to its three local pages, and uses path remapping for release builds. The rebuilt browser module and packaged macOS executable passed a check for the original private build path.

The locked dependency scan used RustSec database revision `26fd2d43`. It returned zero vulnerability entries and two warnings. The Linux GTK stack uses a GLib version with a potentially unsound string iterator. A build-time macro dependency is unmaintained. See [the advisory details](SECURITY.md).

The release artifact is a source archive, with a separate SHA-256 checksum. Third-party notices for the bundled browser module are in [third-party](third-party/README.md). Native installers and platform signing are outside the scope of this release.
