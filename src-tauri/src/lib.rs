use reqwest::Client;
use tauri::{State, Manager};
use serde_json::Value;

struct AppState {
    client: Client,
}

#[tauri::command]
async fn fetch_prices(state: State<'_, AppState>) -> Result<Value, String> {
    let res = state.client
        .get("https://prices.runescape.wiki/api/v1/osrs/latest")
        .header("User-Agent", "osrs-afk-optimiser/1.0.0 (contact: github.com/matthewjdoyle)")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json = res.json::<Value>().await.map_err(|e| e.to_string())?;
    Ok(json)
}

#[tauri::command]
async fn fetch_mapping(state: State<'_, AppState>) -> Result<Value, String> {
    let res = state.client
        .get("https://prices.runescape.wiki/api/v1/osrs/mapping")
        .header("User-Agent", "osrs-afk-optimiser/1.0.0 (contact: github.com/matthewjdoyle)")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json = res.json::<Value>().await.map_err(|e| e.to_string())?;
    Ok(json)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let client = Client::new();
    
    tauri::Builder::default()
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                if let Some(icon) = app.default_window_icon() {
                    let _ = window.set_icon(icon.clone());
                }
            }
            Ok(())
        })
        .manage(AppState { client })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .invoke_handler(tauri::generate_handler![fetch_prices, fetch_mapping])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
