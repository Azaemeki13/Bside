use axum::{extract::State, extract::Path, Json};
use sqlx::PgPool;
use crate::User;
use crate::UserPayload;
use crate::Song;
use crate::SongPayload;

#[axum::debug_handler]
pub async fn ping_handler() -> &'static str 
{
    "pong"
}

#[axum::debug_handler]
pub async fn create_user_handler(State(pool): State<PgPool>,
    axum::extract::Json(payload): axum::extract::Json<UserPayload>,) -> Result<Json<User>, axum::http::StatusCode>
{
    let user = sqlx::query_as::<_, User>
        ("INSERT INTO users (username) VALUES ($1) RETURNING id, username, created_at")
        .bind(payload.username)
        .fetch_one(&pool)
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok (Json(user))

}

pub async fn get_all_users_handler(State(pool): State<PgPool>, ) -> Result<Json<Vec<User>>, axum::http::StatusCode>
{
    let users = sqlx::query_as::<_,User>("SELECT id, username, created_at FROM users ORDER BY created_at ASC")
        .fetch_all(&pool)
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(axum::Json(users))
}

pub async fn get_all_users_by_id_handler(State(pool): State<PgPool>, Path(user_id):Path<uuid::Uuid>,) ->Result<Json<User>, axum::http::StatusCode>
{
    let user = sqlx::query_as::<_,User>("SELECT id, username, created_at FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(&pool)
        .await
        .map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
    match user
    {
        Some(found_user) => Ok(Json(found_user)),
        None => Err(axum::http::StatusCode::NOT_FOUND),
    }
}

pub async fn create_song_handler(State(pool): State<PgPool>, 
    axum::extract::Json(payload): axum::extract::Json<SongPayload>, )->Result<Json<Song>, axum::http::StatusCode>
{
    let song = sqlx::query_as!
        (Song, "INSERT INTO songs (title, artist, duration_seconds, audio_url, ml_features) VALUES ($1, $2, $3, $4, $5) RETURNING id, title, artist, duration_seconds, audio_url, ml_features, created_at", payload.title, payload.artist, payload.duration_seconds, payload.audio_url,
         payload.ml_features)
        .fetch_one(&pool)
        .await
        .map_err(|e| 
            {eprintln!("Database error {}", e);
            axum::http::StatusCode::INTERNAL_SERVER_ERROR})?;
    Ok(Json(song))
}
