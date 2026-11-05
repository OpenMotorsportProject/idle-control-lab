# Third-party materials

The checked-in browser runtime includes the Rust standard library in the WebAssembly inside `neural-wasm.js`. The accompanying Rust 1.95.0 library copyright document reproduces upstream attributions and license texts for its in-tree and bundled dependencies. The Apache-2.0 license is in the project root. The Rust MIT text is included alongside this file.

The source release contains Cargo manifests and a checksummed lockfile, rather than copies of the desktop dependency sources. They retain their respective licenses. GTK, WebKitGTK, WKWebView, Edge WebView2, and the WebView2 SDK loader are separate upstream products. A distributor shipping native binaries must include the applicable dependency and SDK notices for the actual target and review any redistributable components. The project source archive contains no native executables or WebView2 loader binaries.

The manual cites the original HNN and loss-landscape papers. It includes links, original diagrams and examples. The research papers are not bundled.
