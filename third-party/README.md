# Third-party materials

The checked-in browser runtime includes the Rust standard library in the WebAssembly inside `neural-wasm.js`. The accompanying Rust 1.95.0 library copyright document reproduces upstream attributions and license texts for its in-tree and bundled dependencies. The Apache-2.0 license is in the project root. The Rust MIT text is included alongside this file.

Desktop packages include `DESKTOP-NOTICES.txt`, generated from the locked Cargo dependency tree and upstream license files for the target, including build dependencies. Where applicable, `MPL-sources/` contains the matching unmodified crates. The Windows executable statically links the x64 WebView2 SDK loader from Microsoft.Web.WebView2 1.0.3800.47. Its SDK license and notice accompany the executable. The WebView2 runtime is supplied separately by Microsoft. Linux loads the system GTK and WebKitGTK libraries. macOS uses the system WKWebView.

The manual cites the original HNN and loss-landscape papers. It includes links, original diagrams and examples. The research papers are not bundled.
