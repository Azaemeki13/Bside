use crate::{AppState, BSideError, RawSearchResult, SearchResult};
use axum::Json;
use axum::extract::{Query, State};
use axum::{extract::{ws::{Message, WebSocket, WebSocketUpgrade},State,},response::IntoResponse}
use futures_util::{SinkExt, StreamExt}

//SinkExt-> sender.send(Message::Text(...)).await
//StreamExt-> receiver.next().await

pub async fn ws_handler(ws::WebSocketUpgrade, State(state): State<AppState>,) -> impl IntoResponse {
    //Une fois le socket obtenu, appelez handle_socket(socket, state).
    ws.on_upgrade(move | socket | handle_socket(socket, state)
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    }