use tao::{
    dpi::LogicalSize,
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoop},
    window::WindowBuilder,
};
use wry::{
    http::{Response, StatusCode},
    NewWindowResponse, WebViewBuilder,
};

const START: &str = "idlelab://localhost/neural.html";

fn asset(path: &str) -> Option<(&'static str, &'static [u8])> {
    macro_rules! assets {
        ($($file:literal => $mime:literal),+ $(,)?) => {
            match path {
                $(concat!("/", $file) => Some(($mime, include_bytes!(concat!("../../", $file))))),+,
                _ => None,
            }
        };
    }
    assets! {
        "icons/idle-control.svg" => "image/svg+xml", "icons/apple-touch-icon.png" => "image/png",
        "index.html" => "text/html; charset=utf-8",
        "neural.html" => "text/html; charset=utf-8",
        "manual.html" => "text/html; charset=utf-8",
        "lab.css" => "text/css", "neural.css" => "text/css",
        "model.js" => "text/javascript", "optimizer.js" => "text/javascript",
        "app.js" => "text/javascript", "neural.js" => "text/javascript",
        "neural-wasm.js" => "text/javascript", "network-diagram.js" => "text/javascript",
    }
}

const REFERENCES: [&str; 2] = [
    "https://greydanus.github.io/2019/05/15/hamiltonian-nns/",
    "https://proceedings.neurips.cc/paper_files/paper/2018/hash/a41b3bb3e6b050b6c9067c67f663b915-Abstract.html",
];

fn local_page(url: &str) -> bool {
    let origin = if cfg!(target_os = "windows") {
        "http://idlelab.localhost/"
    } else {
        "idlelab://localhost/"
    };
    matches!(
        url.strip_prefix(origin),
        Some("index.html" | "neural.html" | "manual.html")
    )
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let event_loop = EventLoop::new();
    let builder = WindowBuilder::new()
        .with_title("Idle Control Lab")
        .with_inner_size(LogicalSize::new(1160., 840.))
        .with_min_inner_size(LogicalSize::new(580., 520.));
    #[cfg(any(target_os = "windows", target_os = "linux"))]
    let builder = {
        let pixels: &[u8; 64 * 64 * 4] = include_bytes!("../icons/window-64.rgba");
        let icon = tao::window::Icon::from_rgba(pixels.to_vec(), 64, 64)?;
        #[cfg(target_os = "windows")]
        let builder = {
            use tao::platform::windows::WindowBuilderExtWindows;
            builder.with_taskbar_icon(Some(icon.clone()))
        };
        builder.with_window_icon(Some(icon))
    };
    let window = builder.build(&event_loop)?;
    let builder = WebViewBuilder::new()
        .with_custom_protocol("idlelab".into(), |_, request| {
            let reply = Response::builder().header("X-Content-Type-Options", "nosniff");
            if let Some((mime, bytes)) = asset(request.uri().path()) {
                reply.header("Content-Type", mime)
                    .header("Content-Security-Policy", "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
                    .body(bytes.into()).unwrap()
            } else {
                reply.status(StatusCode::NOT_FOUND).body(Vec::new().into()).unwrap()
            }
        })
        .with_navigation_handler(|url| {
            if REFERENCES.contains(&url.as_str()) {
                // Only these two compile-time HTTPS citations may leave the app.
                let _ = open::that_detached(url);
                return false;
            }
            local_page(&url)
        })
        .with_download_started_handler(|_, _| false)
        .with_new_window_req_handler(|_, _| NewWindowResponse::Deny)
        .with_url(START);
    #[cfg(target_os = "linux")]
    let _webview = {
        use tao::platform::unix::WindowExtUnix;
        use wry::WebViewBuilderExtUnix;
        builder.build_gtk(
            window
                .default_vbox()
                .ok_or("GTK window has no content area")?,
        )?
    };
    #[cfg(not(target_os = "linux"))]
    let _webview = builder.build(&window)?;
    event_loop.run(move |event, _, flow| {
        *flow = ControlFlow::Wait;
        if matches!(
            event,
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            }
        ) {
            *flow = ControlFlow::Exit;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn packaged_resources_are_exact_and_navigation_stays_local() {
        assert!(asset("/neural.html").is_some());
        assert!(asset("/neural-wasm.js").is_some());
        assert!(asset("/network-diagram.js").is_some());
        for path in [
            "/../Cargo.toml",
            "/%2e%2e/model.js",
            "//model.js",
            "/LICENSE",
        ] {
            assert!(asset(path).is_none());
        }
        let local = if cfg!(target_os = "windows") {
            "http://idlelab.localhost/"
        } else {
            "idlelab://localhost/"
        };
        assert!(local_page(&format!("{local}manual.html")));
        for url in [
            "https://example.org",
            "file:///etc/passwd",
            "idlelab://localhost.example/neural.html",
            "javascript:alert(1)",
        ] {
            assert!(!local_page(url));
        }
    }
}
