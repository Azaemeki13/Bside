use crate::auth::Claims;
use crate::models::{AppState, ChatMessage, ChatMessageRecord, SharedSong};
use axum::extract::Query;
use axum::extract::ws::Message;
use axum::http::StatusCode;
use axum::{
    extract::{
        State,
        ws::{WebSocket, WebSocketUpgrade},
    },
    response::IntoResponse,
};
use chrono::{DateTime, Utc};
use futures_util::{SinkExt, StreamExt};
use jsonwebtoken::{DecodingKey, Validation, decode};
use secrecy::ExposeSecret;
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct WsConnectQuery {
    pub token: String,
}

fn default_message_type() -> String {
    "text".to_string()
}

#[derive(Deserialize)]
#[serde(tag = "type")]
enum ClientWsMessage {
    #[serde(rename = "private_message")]
    PrivateMessage {
        to_user_id: Uuid,

        #[serde(default)]
        content: String,

        #[serde(default = "default_message_type")]
        message_type: String,

        #[serde(default)]
        song_id: Option<Uuid>,
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
        message_type: String,
        song_id: Option<Uuid>,
        shared_song: Option<SharedSong>,
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
    UserOffline { to_user_id: Uuid, message: String },

    #[serde(rename = "invalid_message")]
    InvalidMessage { message: String },

    #[serde(rename = "friend_request_received")]
    FriendRequestReceived {
        friendship_id: Uuid,
        from_user_id: Uuid,
    },

    #[serde(rename = "friend_request_accepted")]
    FriendRequestAccepted {
        friendship_id: Uuid,
        by_user_id: Uuid,
    },

    #[serde(rename = "friend_request_rejected")]
    FriendRequestRejected {
        friendship_id: Uuid,
        by_user_id: Uuid,
    },

    #[serde(rename = "friend_removed")]
    FriendRemoved { by_user_id: Uuid },
}

async fn find_shareable_song(
    state: &AppState,
    song_id: Uuid,
) -> Result<Option<SharedSong>, sqlx::Error> {
    sqlx::query_as!(
        SharedSong,
        r#"
        SELECT
            s.id,
            s.title,
            s.duration_seconds,
            s.audio_url,
            s.status::text AS "status!",
            ar.name AS "artist_name!",
            a.cover_url AS "cover_url!"
        FROM songs s
        JOIN albums a ON a.id = s.album_id
        JOIN artists ar ON ar.id = a.artist_id
        WHERE
            s.id = $1
            AND s.status = 'Ready'
        "#,
        song_id
    )
    .fetch_optional(&state.db)
    .await
}

async fn send_server_message(state: &AppState, target_user_id: Uuid, message: &ServerWsMessage) {
    let serialized_message = match serde_json::to_string(message) {
        Ok(value) => value,
        Err(error) => {
            println!("Failed to serialize WebSocket message: {error}");
            return;
        }
    };

    let target_sender = {
        let online_users = state.network.online_users.lock().await;
        online_users.get(&target_user_id).cloned()
    };

    if let Some(sender) = target_sender {
        if sender.send(serialized_message).is_err() {
            println!("Failed to send WebSocket message to user {target_user_id}");
        }
    }
}

pub async fn notify_friend_request_received(
    state: &AppState,
    target_user_id: Uuid,
    friendship_id: Uuid,
    from_user_id: Uuid,
) {
    send_server_message(
        state,
        target_user_id,
        &ServerWsMessage::FriendRequestReceived {
            friendship_id,
            from_user_id,
        },
    )
    .await;
}

pub async fn notify_friend_request_accepted(
    state: &AppState,
    target_user_id: Uuid,
    friendship_id: Uuid,
    by_user_id: Uuid,
) {
    send_server_message(
        state,
        target_user_id,
        &ServerWsMessage::FriendRequestAccepted {
            friendship_id,
            by_user_id,
        },
    )
    .await;
}

pub async fn notify_friend_request_rejected(
    state: &AppState,
    target_user_id: Uuid,
    friendship_id: Uuid,
    by_user_id: Uuid,
) {
    send_server_message(
        state,
        target_user_id,
        &ServerWsMessage::FriendRequestRejected {
            friendship_id,
            by_user_id,
        },
    )
    .await;
}

pub async fn notify_friend_removed(state: &AppState, target_user_id: Uuid, by_user_id: Uuid) {
    send_server_message(
        state,
        target_user_id,
        &ServerWsMessage::FriendRemoved { by_user_id },
    )
    .await;
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Query(query): Query<WsConnectQuery>,
) -> Result<impl IntoResponse, StatusCode> {
    let token_data = decode::<Claims>(
        &query.token,
        &DecodingKey::from_secret(state.jwt.expose_secret().as_bytes()),
        &Validation::default(),
    )
    .map_err(|_| StatusCode::UNAUTHORIZED)?;

    let user_id = token_data.claims.sub;

    let is_banned = sqlx::query_scalar!("SELECT is_banned FROM users WHERE id = $1", user_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if !matches!(is_banned, Some(false)) {
        return Err(StatusCode::FORBIDDEN);
    }

    Ok(ws.on_upgrade(move |socket| handle_socket(socket, state, user_id)))
}

async fn handle_socket(socket: WebSocket, state: AppState, user_id: Uuid) {
    println!("New WebSocket connection for user: {user_id}");

    let (mut sender, mut receiver) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    {
        let mut online_users = state.network.online_users.lock().await;
        online_users.insert(user_id, tx);

        println!("User {user_id} is now online");
        println!("Online users count: {}", online_users.len());
    }

    let mut send_task = tokio::spawn(async move {
        while let Some(message) = rx.recv().await {
            if sender.send(Message::Text(message.into())).await.is_err() {
                break;
            }
        }
    });

    let state_for_receive = state.clone();

    let mut receive_task = tokio::spawn(async move {
        while let Some(message_result) = receiver.next().await {
            let message = match message_result {
                Ok(message) => message,
                Err(error) => {
                    println!("WebSocket receive error for user {user_id}: {error}");
                    break;
                }
            };

            match message {
                Message::Text(text) => {
                    println!("Message received from user {user_id}: {text}");

                    let parsed_message = serde_json::from_str::<ClientWsMessage>(text.as_str());

                    match parsed_message {
                        Ok(ClientWsMessage::PrivateMessage {
                            to_user_id,
                            content,
                            message_type,
                            song_id,
                        }) => {
                            if to_user_id == user_id {
                                let invalid_message = ServerWsMessage::InvalidMessage {
                                    message: "You cannot send a message to yourself.".to_string(),
                                };

                                send_server_message(&state_for_receive, user_id, &invalid_message)
                                    .await;

                                continue;
                            }

                            let content = content.trim().to_string();
                            let message_type = message_type.trim().to_ascii_lowercase();

                            let (normalized_song_id, shared_song) = match message_type.as_str() {
                                "text" => {
                                    if content.is_empty() {
                                        let invalid_message = ServerWsMessage::InvalidMessage {
                                            message: "Text message cannot be empty.".to_string(),
                                        };

                                        send_server_message(
                                            &state_for_receive,
                                            user_id,
                                            &invalid_message,
                                        )
                                        .await;

                                        continue;
                                    }

                                    (None, None)
                                }

                                "song" => {
                                    let selected_song_id = match song_id {
                                        Some(song_id) => song_id,
                                        None => {
                                            let invalid_message = ServerWsMessage::InvalidMessage {
                                                message: "song_id is required for a song message."
                                                    .to_string(),
                                            };

                                            send_server_message(
                                                &state_for_receive,
                                                user_id,
                                                &invalid_message,
                                            )
                                            .await;

                                            continue;
                                        }
                                    };

                                    match find_shareable_song(&state_for_receive, selected_song_id)
                                        .await
                                    {
                                        Ok(Some(song)) => (Some(selected_song_id), Some(song)),
                                        Ok(None) => {
                                            let invalid_message = ServerWsMessage::InvalidMessage {
                                                message: "Song not found or not ready.".to_string(),
                                            };

                                            send_server_message(
                                                &state_for_receive,
                                                user_id,
                                                &invalid_message,
                                            )
                                            .await;

                                            continue;
                                        }
                                        Err(error) => {
                                            println!("Failed to load shared song: {error}");

                                            let invalid_message = ServerWsMessage::InvalidMessage {
                                                message: "Failed to load the shared song."
                                                    .to_string(),
                                            };

                                            send_server_message(
                                                &state_for_receive,
                                                user_id,
                                                &invalid_message,
                                            )
                                            .await;

                                            continue;
                                        }
                                    }
                                }

                                _ => {
                                    let invalid_message = ServerWsMessage::InvalidMessage {
                                        message: format!(
                                            "Unsupported message type: {message_type}"
                                        ),
                                    };

                                    send_server_message(
                                        &state_for_receive,
                                        user_id,
                                        &invalid_message,
                                    )
                                    .await;

                                    continue;
                                }
                            };

                            let saved_record = sqlx::query_as!(
                                ChatMessageRecord,
                                r#"
                                INSERT INTO messages (
                                    sender_id,
                                    receiver_id,
                                    content,
                                    message_type,
                                    song_id,
                                    status
                                )
                                VALUES ($1, $2, $3, $4, $5, 'sent')
                                RETURNING
                                    id,
                                    sender_id,
                                    receiver_id,
                                    content,
                                    message_type AS "message_type!",
                                    song_id,
                                    status,
                                    created_at,
                                    delivered_at,
                                    read_at
                                "#,
                                user_id,
                                to_user_id,
                                &content,
                                &message_type,
                                normalized_song_id
                            )
                            .fetch_one(&state_for_receive.db)
                            .await;

                            let saved_record = match saved_record {
                                Ok(message) => message,
                                Err(error) => {
                                    println!("Failed to save message: {error}");

                                    let invalid_message = ServerWsMessage::InvalidMessage {
                                        message: "Failed to save message.".to_string(),
                                    };

                                    send_server_message(
                                        &state_for_receive,
                                        user_id,
                                        &invalid_message,
                                    )
                                    .await;

                                    continue;
                                }
                            };

                            let saved_message = ChatMessage::from_record(saved_record, shared_song);

                            let message_for_receiver = ServerWsMessage::PrivateMessage {
                                message_id: saved_message.id,
                                from_user_id: user_id,
                                content: saved_message.content.clone(),
                                message_type: saved_message.message_type.clone(),
                                song_id: saved_message.song_id,
                                shared_song: saved_message.shared_song.clone(),
                                created_at: saved_message.created_at,
                            };

                            let message_to_send = match serde_json::to_string(&message_for_receiver)
                            {
                                Ok(value) => value,
                                Err(error) => {
                                    println!("Failed to serialize private message: {error}");
                                    continue;
                                }
                            };

                            let target_sender = {
                                let online_users =
                                    state_for_receive.network.online_users.lock().await;
                                online_users.get(&to_user_id).cloned()
                            };

                            match target_sender {
                                Some(sender) => {
                                    if sender.send(message_to_send).is_err() {
                                        println!("Failed to send message to user {to_user_id}");

                                        {
                                            let mut online_users =
                                                state_for_receive.network.online_users.lock().await;
                                            online_users.remove(&to_user_id);
                                        }

                                        let saved_notification = ServerWsMessage::MessageSaved {
                                            message_id: saved_message.id,
                                            to_user_id,
                                            status: saved_message.status.clone(),
                                            message:
                                                "User connection is unavailable. Message saved."
                                                    .to_string(),
                                        };

                                        send_server_message(
                                            &state_for_receive,
                                            user_id,
                                            &saved_notification,
                                        )
                                        .await;
                                    } else {
                                        println!("Message sent from {user_id} to {to_user_id}");

                                        let update_result = sqlx::query!(
                                            r#"
                                            UPDATE messages
                                            SET
                                                status = 'delivered',
                                                delivered_at = NOW()
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

                                    let saved_notification = ServerWsMessage::MessageSaved {
                                        message_id: saved_message.id,
                                        to_user_id,
                                        status: saved_message.status.clone(),
                                        message: "User is offline. Message saved.".to_string(),
                                    };

                                    send_server_message(
                                        &state_for_receive,
                                        user_id,
                                        &saved_notification,
                                    )
                                    .await;
                                }
                            }
                        }
                        Err(error) => {
                            println!("Invalid WebSocket message from user {user_id}: {error}");

                            let invalid_message = ServerWsMessage::InvalidMessage {
                                message: format!("Invalid message format: {error}"),
                            };

                            send_server_message(&state_for_receive, user_id, &invalid_message)
                                .await;
                        }
                    }
                }
                Message::Close(_) => {
                    println!("WebSocket closed by user: {user_id}");
                    break;
                }
                Message::Binary(_) => {
                    let invalid_message = ServerWsMessage::InvalidMessage {
                        message: "Binary WebSocket messages are not supported.".to_string(),
                    };

                    send_server_message(&state_for_receive, user_id, &invalid_message).await;
                }
                Message::Ping(_) | Message::Pong(_) => {}
            }
        }
    });

    tokio::select! {
        _ = &mut send_task => {
            receive_task.abort();
        }
        _ = &mut receive_task => {
            send_task.abort();
        }
    }

    {
        let mut online_users = state.network.online_users.lock().await;
        online_users.remove(&user_id);

        println!("User {user_id} is now offline");
        println!("Online users count: {}", online_users.len());
    }
}
