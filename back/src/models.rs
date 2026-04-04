#[derive(serde::Serialize, sqlx::FromRow)]
pub struct User
{
    pub id: uuid::Uuid,
    pub username: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(serde::Deserialize)]
pub struct UserPayload
{
    pub username: String,
}

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct Song
{
    pub id: uuid::Uuid,
    pub title: String,
    pub artist: String,
    pub duration_seconds: i32,
    pub audio_url: String,
    pub ml_features: Option<serde_json::Value>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(serde::Deserialize)]
pub struct SongPayload
{
    pub title: String,
    pub artist: String,
    pub duration_seconds: i32,
    pub audio_url: String,
    pub ml_features: Option<serde_json::Value>,
}
