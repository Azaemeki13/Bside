use crate::network::NetworkState;
use oauth2::{EndpointNotSet, EndpointSet, basic::BasicClient};
use secrecy::SecretString;
use std::sync::Arc;

#[derive(serde::Serialize, sqlx::FromRow, utoipa::ToSchema)]
pub struct User {
    pub id: uuid::Uuid,
    pub username: String,
    pub email: String,
    pub avatar_url: Option<String>,
    pub role: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
pub struct UserPayload {
    pub username: String,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
pub struct ArtistResponse {
    pub id: uuid::Uuid,
    pub user_id: uuid::Uuid,
    #[schema(example = "MIKAEL JACKSON")]
    pub name: String,
    #[schema(example = "He loved kids")]
    pub bio: Option<String>,
    #[schema(
        example = "https://www.google.com/url?sa=t&source=web&rct=j&url=https%3A%2F%2Fopen.spotify.com%2Fintl-fr%2Fartist%2F3fMbdgg4jU18AjLCKBhRSm&ved=0CBYQjRxqFwoTCPDimtCqsZQDFQAAAAAdAAAAABAG&opi=89978449"
    )]
    pub photo_url: String,
    #[schema(example = "Available")]
    pub status: String,
}

#[derive(serde::Serialize, sqlx::FromRow, utoipa::ToSchema)]
pub struct Song {
    pub id: uuid::Uuid,
    pub album_id: uuid::Uuid,
    pub title: String,
    pub duration_seconds: i32,
    pub audio_url: String,
    pub status: String,
    pub ml_features: Option<serde_json::Value>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
pub struct SongPayload {
    pub title: String,
    pub album_id: uuid::Uuid,
    pub duration_seconds: i32,
    pub format: String,
    pub ml_features: Option<serde_json::Value>,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
pub struct SongResponse {
    pub song: Song,
    pub upload_url: String,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
pub struct AddSongResponse {
    pub message: String,
    pub warning: Option<String>,
}

#[derive(serde::Serialize, sqlx::FromRow, utoipa::ToSchema)]
pub struct Playlist {
    pub id: uuid::Uuid,
    pub title: String,
    pub owner_id: uuid::Uuid,
    pub is_public: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
pub struct UpdateStructurePayload {
    pub title: Option<String>,
    pub description: Option<String>,
    pub is_public: Option<bool>,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
pub struct PlaylistDetailedResponse {
    pub id: uuid::Uuid,
    pub title: String,
    pub description: Option<String>,
    pub owner_id: uuid::Uuid,
    pub owner_username: String,
    pub total_duration: i32,
    pub song_count: i32,
    pub is_public: bool,
    pub songs: Vec<PlaylistSongItem>,
}

#[derive(serde::Serialize, serde::Deserialize, sqlx::FromRow, Debug, utoipa::ToSchema)]
pub struct PlaylistSongItem {
    pub link_id: uuid::Uuid,
    pub song_id: uuid::Uuid,
    pub title: String,
    pub duration_seconds: i32,
    pub position: i32,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
pub struct AlbumResponse {
    pub id: uuid::Uuid,
    pub artist_id: uuid::Uuid,
    pub title: String,
    pub genre: String,
    pub cover_url: String,
    pub status: String,
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
pub struct PlaylistPayload {
    pub title: String,
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
    pub jwt: Arc<SecretString>,
    pub aws_client: aws_sdk_s3::Client,
    //for user status -> online/offline
    pub network: NetworkState,
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
pub struct RegisterPayload {
    pub username: String,
    pub email: String,
    #[schema(value_type = String)]
    pub password: secrecy::SecretString,
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
pub struct LoginPayload {
    pub identifier: String,
    #[schema(value_type = String)]
    pub password: secrecy::SecretString,
}

#[derive(serde::Deserialize)]
pub struct AuthRequest {
    pub code: String,
    pub state: String,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
pub struct AuthResponse {
    pub user: User,
    pub token: String,
}

#[derive(serde::Deserialize, Debug)]
pub struct GoogleUserProfile {
    pub id: String,
    pub email: String,
    pub verified_email: bool,
    pub name: String,
    pub picture: String,
}

#[derive(Debug, serde::Serialize, sqlx::FromRow, utoipa::ToSchema)]
pub struct RawSearchResult {
    pub id: uuid::Uuid,
    pub name: String,
    pub entity_type: String,
    pub rank: f64,
    pub metadata: Option<String>,
    pub audio_url: Option<String>,
}

#[derive(Debug, serde::Serialize, utoipa::ToSchema)]
#[serde(tag = "type", content = "data", rename_all = "lowercase")]
pub enum SearchResult {
    Song {
        id: uuid::Uuid,
        title: String,
        artist: String,
        audio_url: String,
    },
    Album {
        id: uuid::Uuid,
        name: String,
        artist: String,
    },
    Artist {
        id: uuid::Uuid,
        name: String,
    },
    Playlist {
        id: uuid::Uuid,
        name: String,
        creator: String,
    },
}
