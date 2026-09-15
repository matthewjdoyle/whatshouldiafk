
fn check() {
    tauri::Builder::default().setup(|app| {
        use tauri::Manager;
        let window = app.get_webview_window("main").unwrap();
        if let Some(icon) = app.default_window_icon() {
            let _ = window.set_icon(icon.clone());
        }
        Ok(())
    });
}

