use oauth2::{EndpointNotSet, EndpointSet, basic::BasicClient};

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct User {
    pub id: uuid::Uuid,
    pub username: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(serde::Deserialize)]
pub struct UserPayload {
    pub username: String,
}

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct Song {
    pub id: uuid::Uuid,
    pub title: String,
    pub artist: String,
    pub duration_seconds: i32,
    pub audio_url: String,
    pub ml_features: Option<serde_json::Value>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(serde::Deserialize)]
pub struct SongPayload {
    pub title: String,
    pub artist: String,
    pub duration_seconds: i32,
    pub audio_url: String,
    pub ml_features: Option<serde_json::Value>,
}

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct Playlist {
    pub id: uuid::Uuid,
    pub name: String,
    pub owner_id: uuid::Uuid,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(serde::Deserialize)]
pub struct PlaylistPayload {
    pub name: String,
    pub owner_id: uuid::Uuid,
}

#[derive(serde::Serialize)]
pub struct PlaylistResponse {
    pub id: uuid::Uuid,
    pub name: String,
    pub owner_id: uuid::Uuid,
    pub songs: serde_json::Value,
}

pub type AppClient = BasicClient<
    EndpointSet,    // HasAuthUrl
    EndpointNotSet, // HasDeviceAuthUrl
    EndpointNotSet, // HasIntrospectionUrl
    EndpointNotSet, // HasRevocationUrl
    EndpointSet,    // HasTokenUrl
>;

#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::PgPool,
    pub oauth_client: AppClient,
    pub http_client: reqwest::Client,
}

#[derive(serde::Deserialize)]
pub struct AuthRequest {
    pub code: String,
    pub state: String,
}

#[derive(serde::Deserialize, Debug)]
pub struct GoogleUserProfile {
    pub id: String,
    pub email: String,
    pub verified_email: bool,
    pub name: String,
    pub picture: String,
}
