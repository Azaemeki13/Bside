use crate::models::AppState;
use axum::extract::Query;
use axum::extract::ws::Message;
use axum::{
    extract::{
        State,
        ws::{WebSocket, WebSocketUpgrade},
    },
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use tokio::sync::mpsc;
use uuid::Uuid;

//SinkExt-> sender.send(Message::Text(...)).await
//StreamExt-> receiver.next().await

//receive query parameters from the URL when using a WebSocket connection.
//received -> ws://localhost:3000/ws?user_id=550e8400-e29b-41d4-a716-446655440000
//analyse -> WsConnectQuery {
//     user_id: 550e8400-e29b-41d4-a716-446655440000
// }
#[derive(Deserialize)]
pub struct WsConnectQuery {
    pub user_id: Uuid,
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Query(query): Query<WsConnectQuery>,
) -> impl IntoResponse {
    //(move | socket | handle_socket(socket, state)-> Une fois le socket obtenu, appelez handle_socket(socket, state).
    ws.on_upgrade(move |socket| handle_socket(socket, state, query.user_id))
}

async fn handle_socket(socket: WebSocket, state: AppState, user_id: Uuid) {
    println!("New WebSocket connection for user: {user_id}");
    let (mut sender, mut receiver) = socket.split();
    //create a sender
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    //save user online statue
    {
        let mut online_users = state.network.online_users.lock().await;
        online_users.insert(user_id, tx);
        println!("User {user_id} is now online");
        println!("Online users count: {}", online_users.len());
    }
    //wait for rx if have some messages, if yes send to front
    let mut send_task = tokio::spawn(async move {
        while let Some(message) = rx.recv().await {
            if sender.send(Message::Text(message.into())).await.is_err() {
                break;
            }
        }
    });
    //on the same time, still listen if have new messages
    let mut receive_task = tokio::spawn(async move {
        while let Some(Ok(message)) = receiver.next().await {
            if let Message::Close(_) = message {
                println!("WebSocket closed by user: {user_id}");
                break;
            }
        }
    });
    //wait for new messages
    tokio::select! {
        _ = &mut send_task => {
            receive_task.abort();
        }
        _ = &mut receive_task => {
            send_task.abort();
        }
    }
    //remove if user is offline
    {
        let mut online_users = state.network.online_users.lock().await;
        online_users.remove(&user_id);

        println!("User {user_id} is now offline");
        println!("Online users count: {}", online_users.len());
    }
}
