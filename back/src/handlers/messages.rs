//! Direct messages between users, including the shared-song attachment
//! variant and the inbox-style conversation list.

use crate::models::{ChatMessage, ConversationListItem, MarkMessagesReadResponse, SharedSong};
use crate::{AppState, BSideError, Claims};
use axum::{
    Json,
    extract::{Path, State},
};
use uuid::Uuid;

#[utoipa::path(
    get,
    path = "/messages/{other_user_id}",
    params(
        ("other_user_id" = uuid::Uuid, Path, description = "The other user ID in the conversation")
    ),
    responses(
        (status = 200, description = "Conversation messages loaded successfully", body = Vec<ChatMessage>),
        (status = 401, description = "Unauthorized"),
        (status = 500, description = "Internal server error")
    ),
    security(("Bearer" = [])),
    tags = ["Messages"]
)]
pub async fn get_conversation_messages_handler(
    State(state): State<AppState>,
    claims: Claims,
    Path(other_user_id): Path<Uuid>,
) -> Result<Json<Vec<ChatMessage>>, BSideError> {
    let current_user_id = claims.sub;

    let rows = sqlx::query!(
        r#"
        SELECT
            m.id,
            m.sender_id,
            m.receiver_id,
            m.content,
            m.message_type AS "message_type!",
            m.song_id,
            m.status,
            m.created_at,
            m.delivered_at,
            m.read_at,

            s.id AS "shared_song_id?",
            s.title AS "shared_song_title?",
            s.duration_seconds AS "shared_song_duration_seconds?",
            s.audio_url AS "shared_song_audio_url?",
            s.status::text AS "shared_song_status?",
            ar.name AS "shared_song_artist_name?",
            a.cover_url AS "shared_song_cover_url?"

        FROM messages m

        LEFT JOIN songs s
            ON s.id = m.song_id

        LEFT JOIN albums a
            ON a.id = s.album_id

        LEFT JOIN artists ar
            ON ar.id = a.artist_id

        WHERE
            (m.sender_id = $1 AND m.receiver_id = $2)
            OR
            (m.sender_id = $2 AND m.receiver_id = $1)

        ORDER BY m.created_at ASC
        "#,
        current_user_id,
        other_user_id
    )
    .fetch_all(&state.db)
    .await?;

    let messages = rows
        .into_iter()
        .map(|row| {
            let shared_song = match (
                row.shared_song_id,
                row.shared_song_title,
                row.shared_song_duration_seconds,
                row.shared_song_audio_url,
                row.shared_song_status,
                row.shared_song_artist_name,
                row.shared_song_cover_url,
            ) {
                (
                    Some(id),
                    Some(title),
                    Some(duration_seconds),
                    Some(audio_url),
                    Some(status),
                    Some(artist_name),
                    Some(cover_url),
                ) => Some(SharedSong {
                    id,
                    title,
                    duration_seconds,
                    audio_url,
                    status,
                    artist_name,
                    cover_url,
                }),

                _ => None,
            };

            ChatMessage {
                id: row.id,
                sender_id: row.sender_id,
                receiver_id: row.receiver_id,
                content: row.content,
                message_type: row.message_type,
                song_id: row.song_id,
                shared_song,
                status: row.status,
                created_at: row.created_at,
                delivered_at: row.delivered_at,
                read_at: row.read_at,
            }
        })
        .collect();

    Ok(Json(messages))
}
#[utoipa::path(
    put,
    path = "/messages/{other_user_id}/read",
    params(
        (
            "other_user_id" = Uuid,
            Path,
            description = "ID of the other user in the conversation"
        )
    ),
    responses(
        (
            status = 200,
            description = "Conversation messages marked as read",
            body = MarkMessagesReadResponse
        ),
        (
            status = 401,
            description = "Unauthorized"
        ),
        (
            status = 500,
            description = "Internal server error"
        )
    ),
    security(
        ("bearer_auth" = [])
    ),
    tags = ["Messages"]
)]
pub async fn mark_conversation_messages_as_read_handler(
    State(state): State<AppState>,
    claims: Claims,
    Path(other_user_id): Path<Uuid>,
) -> Result<Json<MarkMessagesReadResponse>, BSideError> {
    let current_user_id = claims.sub;

    let result = sqlx::query!(
        r#"
        UPDATE messages
        SET
            status = 'read',
            delivered_at = COALESCE(delivered_at, NOW()),
            read_at = NOW()
        WHERE
            sender_id = $1
            AND receiver_id = $2
            AND read_at IS NULL
        "#,
        other_user_id,
        current_user_id
    )
    .execute(&state.db)
    .await?;

    Ok(Json(MarkMessagesReadResponse {
        read_count: result.rows_affected(),
    }))
}

#[utoipa::path(
    get,
    path = "/conversations",
    responses(
        (status = 200, description = "Conversation list loaded successfully", body = Vec<ConversationListItem>),
        (status = 401, description = "Unauthorized"),
        (status = 500, description = "Internal server error")
    ),
    security(("Bearer" = [])),
    tags = ["Messages"]
)]
pub async fn get_conversations_handler(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<Vec<ConversationListItem>>, BSideError> {
    let current_user_id = claims.sub;

    let conversations = sqlx::query_as!(
        ConversationListItem,
        r#"
        WITH user_messages AS (
            SELECT
                m.id,
                m.sender_id,
                m.receiver_id,
                CASE
                    WHEN m.message_type = 'song' THEN 'Shared a song'
                    ELSE m.content
                END AS content,
                m.status,
                m.created_at,
                CASE
                    WHEN m.sender_id = $1 THEN m.receiver_id
                    ELSE m.sender_id
                END AS other_user_id
            FROM messages m
            WHERE m.sender_id = $1 OR m.receiver_id = $1
        ),
        last_messages AS (
            SELECT DISTINCT ON (other_user_id)
                other_user_id,
                id AS last_message_id,
                sender_id AS last_sender_id,
                receiver_id AS last_receiver_id,
                content AS last_message,
                status AS last_message_status,
                created_at AS last_message_at
            FROM user_messages
            ORDER BY other_user_id, created_at DESC
        ),
        unread_counts AS (
            SELECT
                sender_id AS other_user_id,
                COUNT(*)::BIGINT AS unread_count
            FROM messages
            WHERE
                receiver_id = $1
                AND read_at IS NULL
            GROUP BY sender_id
        )
        SELECT
            u.id AS "other_user_id!",
            u.username AS "other_username!",
            u.display_name AS other_display_name,
            u.email AS "other_email!",
            u.avatar_url AS other_avatar_url,

            lm.last_message_id AS "last_message_id!",
            lm.last_sender_id AS "last_sender_id!",
            lm.last_receiver_id AS "last_receiver_id!",
            lm.last_message AS "last_message!",
            lm.last_message_status AS "last_message_status!",
            lm.last_message_at AS "last_message_at!",

            COALESCE(uc.unread_count, 0)::BIGINT AS "unread_count!"
        FROM last_messages lm
        JOIN users u ON u.id = lm.other_user_id
        LEFT JOIN unread_counts uc ON uc.other_user_id = lm.other_user_id
        ORDER BY lm.last_message_at DESC
        "#,
        current_user_id
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(conversations))
}
