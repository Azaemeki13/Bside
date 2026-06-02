use crate::models::{AppState, ChatMessage};
use chrono::{DateTime, Utc};
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
use serde::{Deserialize, Serialize};
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

#[derive(Deserialize)]
#[serde(tag = "type")]
enum ClientWsMessage {
    #[serde(rename = "private_message")]
    PrivateMessage {
        to_user_id: Uuid,
        content: String,
    },
}

#[derive(Serialize)]
#[serde(tag = "type")]
enum ServerWsMessage {
    #[serde(rename = "private_message")]
    PrivateMessage {
        message_id: Uuid,
        from_user_id: Uuid,
        content: String,
        created_at: DateTime<Utc>,
    },

    #[serde(rename = "message_saved")]
    MessageSaved {
        message_id: Uuid,
        to_user_id: Uuid,
        status: String,
        message: String,
    },

    #[serde(rename = "user_offline")]
    UserOffline {
        to_user_id: Uuid,
        message: String,
    },

    #[serde(rename = "invalid_message")]
    InvalidMessage {
        message: String,
    },
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
    //1. Receive a WebSocket message from A
    // 2. Parse the JSON
    // 3. Retrieve the `to_user_id`
    // 4. Find B in `online_users`
    // 5. If B is online, send the message to B
    // 6. If B is offline, return `user_offline` to A
    // let state_for_receive = state.clone();
    //
    // let mut receive_task = tokio::spawn(async move {
    //     while let Some(Ok(message)) = receiver.next().await {
    //         match message {
    //             Message::Text(text) => {
    //                 println!("Message received from user {user_id}: {text}");
    //
    //                 let parsed_message = serde_json::from_str::<ClientWsMessage>(text.as_str());
    //
    //                 match parsed_message {
    //                     Ok(ClientWsMessage::PrivateMessage {
    //                            to_user_id,
    //                            content,
    //                        }) => {
    //                         println!("Private message from {user_id} to {to_user_id}");
    //
    //                         let server_message = ServerWsMessage::PrivateMessage {
    //                             from_user_id: user_id,
    //                             content,
    //                         };
    //
    //                         let message_to_send = match serde_json::to_string(&server_message) {
    //                             Ok(value) => value,
    //                             Err(error) => {
    //                                 println!("Failed to serialize private message: {error}");
    //                                 continue;
    //                             }
    //                         };
    //
    //                         let target_sender = {
    //                             let online_users = state_for_receive.network.online_users.lock().await;
    //                             online_users.get(&to_user_id).cloned()
    //                         };
    //
    //                         match target_sender {
    //                             Some(sender) => {
    //                                 if sender.send(message_to_send).is_err() {
    //                                     println!("Failed to send message to user {to_user_id}");
    //
    //                                     let mut online_users =
    //                                         state_for_receive.network.online_users.lock().await;
    //                                     online_users.remove(&to_user_id);
    //                                 } else {
    //                                     println!("Message sent from {user_id} to {to_user_id}");
    //                                 }
    //                             }
    //                             None => {
    //                                 println!("User {to_user_id} is offline");
    //
    //                                 let offline_message = ServerWsMessage::UserOffline {
    //                                     to_user_id,
    //                                     message: "User is offline".to_string(),
    //                                 };
    //
    //                                 if let Ok(offline_text) = serde_json::to_string(&offline_message) {
    //                                     let current_user_sender = {
    //                                         let online_users =
    //                                             state_for_receive.network.online_users.lock().await;
    //                                         online_users.get(&user_id).cloned()
    //                                     };
    //
    //                                     if let Some(sender) = current_user_sender {
    //                                         let _ = sender.send(offline_text);
    //                                     }
    //                                 }
    //                             }
    //                         }
    //                     }
    //                     Err(error) => {
    //                         println!("Invalid WebSocket message from user {user_id}: {error}");
    //
    //                         let invalid_message = ServerWsMessage::InvalidMessage {
    //                             message: format!("Invalid message format: {error}"),
    //                         };
    //
    //                         if let Ok(invalid_text) = serde_json::to_string(&invalid_message) {
    //                             let current_user_sender = {
    //                                 let online_users =
    //                                     state_for_receive.network.online_users.lock().await;
    //                                 online_users.get(&user_id).cloned()
    //                             };
    //
    //                             if let Some(sender) = current_user_sender {
    //                                 let _ = sender.send(invalid_text);
    //                             }
    //                         }
    //                     }
    //                 }
    //             }
    //             Message::Close(_) => {
    //                 println!("WebSocket closed by user: {user_id}");
    //                 break;
    //             }
    //             _ => {}
    //         }
    //     }
    // });

    let state_for_receive = state.clone();

    let mut receive_task = tokio::spawn(async move {
        while let Some(Ok(message)) = receiver.next().await {
            match message {
                Message::Text(text) => {
                    println!("Message received from user {user_id}: {text}");

                    let parsed_message = serde_json::from_str::<ClientWsMessage>(text.as_str());

                    match parsed_message {
                        Ok(ClientWsMessage::PrivateMessage {
                               to_user_id,
                               content,
                           }) => {
                            println!("Private message from {user_id} to {to_user_id}");

                            let saved_message = sqlx::query_as!(
                            ChatMessage,
                            r#"
                            INSERT INTO messages (sender_id, receiver_id, content, status)
                            VALUES ($1, $2, $3, 'sent')
                            RETURNING
                                id,
                                sender_id,
                                receiver_id,
                                content,
                                status,
                                created_at,
                                delivered_at,
                                read_at
                            "#,
                            user_id,
                            to_user_id,
                            content
                        )
                                .fetch_one(&state_for_receive.db)
                                .await;

                            let saved_message = match saved_message {
                                Ok(message) => message,
                                Err(error) => {
                                    println!("Failed to save message: {error}");

                                    let invalid_message = ServerWsMessage::InvalidMessage {
                                        message: "Failed to save message".to_string(),
                                    };

                                    if let Ok(invalid_text) = serde_json::to_string(&invalid_message) {
                                        let current_user_sender = {
                                            let online_users =
                                                state_for_receive.network.online_users.lock().await;
                                            online_users.get(&user_id).cloned()
                                        };

                                        if let Some(sender) = current_user_sender {
                                            let _ = sender.send(invalid_text);
                                        }
                                    }

                                    continue;
                                }
                            };

                            let message_for_receiver = ServerWsMessage::PrivateMessage {
                                message_id: saved_message.id,
                                from_user_id: user_id,
                                content: saved_message.content.clone(),
                                created_at: saved_message.created_at,
                            };

                            let message_to_send = match serde_json::to_string(&message_for_receiver) {
                                Ok(value) => value,
                                Err(error) => {
                                    println!("Failed to serialize private message: {error}");
                                    continue;
                                }
                            };

                            let target_sender = {
                                let online_users = state_for_receive.network.online_users.lock().await;
                                online_users.get(&to_user_id).cloned()
                            };

                            match target_sender {
                                Some(sender) => {
                                    if sender.send(message_to_send).is_err() {
                                        println!("Failed to send message to user {to_user_id}");

                                        let mut online_users =
                                            state_for_receive.network.online_users.lock().await;
                                        online_users.remove(&to_user_id);
                                    } else {
                                        println!("Message sent from {user_id} to {to_user_id}");

                                        let update_result = sqlx::query!(
                                        r#"
                                        UPDATE messages
                                        SET status = 'delivered', delivered_at = NOW()
                                        WHERE id = $1
                                        "#,
                                        saved_message.id
                                    )
                                            .execute(&state_for_receive.db)
                                            .await;

                                        if let Err(error) = update_result {
                                            println!("Failed to update message status: {error}");
                                        }
                                    }
                                }
                                None => {
                                    println!("User {to_user_id} is offline. Message saved.");

                                    let offline_message = ServerWsMessage::MessageSaved {
                                        message_id: saved_message.id,
                                        to_user_id,
                                        status: saved_message.status,
                                        message: "User is offline. Message saved.".to_string(),
                                    };

                                    if let Ok(offline_text) = serde_json::to_string(&offline_message) {
                                        let current_user_sender = {
                                            let online_users =
                                                state_for_receive.network.online_users.lock().await;
                                            online_users.get(&user_id).cloned()
                                        };

                                        if let Some(sender) = current_user_sender {
                                            let _ = sender.send(offline_text);
                                        }
                                    }
                                }
                            }
                        }
                        Err(error) => {
                            println!("Invalid WebSocket message from user {user_id}: {error}");

                            let invalid_message = ServerWsMessage::InvalidMessage {
                                message: format!("Invalid message format: {error}"),
                            };

                            if let Ok(invalid_text) = serde_json::to_string(&invalid_message) {
                                let current_user_sender = {
                                    let online_users =
                                        state_for_receive.network.online_users.lock().await;
                                    online_users.get(&user_id).cloned()
                                };

                                if let Some(sender) = current_user_sender {
                                    let _ = sender.send(invalid_text);
                                }
                            }
                        }
                    }
                }
                Message::Close(_) => {
                    println!("WebSocket closed by user: {user_id}");
                    break;
                }
                _ => {}
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
