#![deny(clippy::unwrap_used)]
#![warn(clippy::pedantic)]
#![warn(clippy::nursery)]

mod auth;
mod error;
mod handlers;
mod models;
mod network;
mod search;
mod swagger;
mod ws;

use crate::auth::{AnyAuth, Claims, auth_gate, bootstrap_admin};
use crate::error::BSideError;
use crate::handlers::{
    add_song_to_playlist_handler, admin_create_album_for_artist_handler, classic_auth_handler,
    contact_handler, create_album_handler, create_artist_handler, create_artist_request_handler,
    create_playlist_handler, create_song_handler, create_user_handler, delete_album_handler,
    delete_playlist_handler, delete_song_handler, get_album_by_id_handler, get_all_users_handler,
    get_artist_by_id_handler, get_artist_requests_handler, get_artists_handler,
    get_conversation_messages_handler, get_conversations_handler, get_liked_songs_handler,
    get_me_handler, get_my_albums_handler, get_my_playlists_handler, get_playlist_by_id_handler,
    get_song_stream_url_handler, get_user_by_id_handler, google_callback_handler,
    google_login_handler, google_signup_handler, like_song_handler,
    mark_conversation_messages_as_read_handler, ping_handler, register_handler,
    remove_song_from_pl, review_artist_request_handler, unlike_song_handler,
    update_playlist_handler, upload_avatar, verify_song_handler,
};
use crate::models::{
    AddSongResponse, AlbumDetailedResponse, AlbumListItem, AlbumResponse, AlbumSongItem, AppState,
    ArtistDetailResponse, ArtistRequestPayload, ArtistRequestResponse, ArtistRequestReviewPayload,
    ArtistResponse, ArtistSongItem, AuthRequest, AuthResponse, ContactPayload, GoogleUserProfile,
    LoginPayload, Playlist, PlaylistDetailedResponse, PlaylistPayload, PlaylistSongItem,
    RawSearchResult, RegisterPayload, SearchResult, Song, SongPayload, SongResponse,
    UpdateStructurePayload, User, UserPayload,
};
use crate::search::searcher;

use crate::ws::ws_handler;
use axum::{
    Router,
    extract::DefaultBodyLimit,
    http::Method,
    middleware::from_fn_with_state,
    routing::{delete, get, post, put},
};
use axum_governor::{GovernorConfigBuilder, GovernorLayer, Quota, extractor::PeerIp, nz};
use oauth2::{AuthUrl, ClientId, ClientSecret, RedirectUrl, TokenUrl, basic::BasicClient};
use reqwest::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE, HeaderValue};
use sqlx::postgres::PgPoolOptions;
use std::env;
use std::sync::Arc;
use std::time::Duration;
use tower_http::cors::CorsLayer;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

#[tokio::main]
async fn main() {
    //tracing_subscriber::fmt()
    //  .with_max_level(tracing::Level::DEBUG)
    //.init(); WHEN DOING DEBUGING
    dotenvy::dotenv().expect("Failed to read .env file");
    let db_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set.");

    println!("Connecting to the database ...");
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await
        .expect("Database connection established !");
    if let Err(e) = bootstrap_admin(&pool).await {
        eprintln!("Warning: Failed to bootstrap admin account: {:?}", e);
    }
    let client_id = env::var("OAUTH_ID").expect("OAUTH_ID must be set.");
    let client_pw = env::var("OAUTH_PW").expect("OAUTH_PW must be set.");
    let auth_uri = env::var("G_AUTH_URL").expect("G_AUTH_URI must be set.");
    let token_uri = env::var("G_TOKEN_URL").expect("G_TOKEN_URI must be set.");
    let redirect_url = env::var("OAUTH_URL").expect("OAUTH_URL must be set.");
    let jwt_secret = env::var("JWT_SECRET").expect("JWT_SECRET must be set.");

    let client = BasicClient::new(ClientId::new(client_id))
        .set_client_secret(ClientSecret::new(client_pw))
        .set_auth_uri(AuthUrl::new(auth_uri).expect("Invalid auth URL"))
        .set_token_uri(TokenUrl::new(token_uri).expect("Invalid token URL"))
        .set_redirect_uri(RedirectUrl::new(redirect_url).expect("Invalid redirect URL"));
    // To change to match an S3 server later on.
    let config_aws = aws_config::from_env().load().await;
    let s3_config = aws_sdk_s3::config::Builder::from(&config_aws)
        .force_path_style(true)
        .build();
    let aws_client = aws_sdk_s3::Client::from_conf(s3_config);
    ensure_storage_buckets(&aws_client)
        .await
        .expect("Storage buckets must be available.");
    let state = AppState {
        db: pool,
        oauth_client: client,
        http_client: reqwest::Client::new(),
        jwt: Arc::new(secrecy::SecretBox::new(jwt_secret.into())),
        aws_client,
        network: network::NetworkState::new(),
    };
    let cors = CorsLayer::new()
        .allow_origin(
            "http://localhost:4200"
                .parse::<HeaderValue>()
                .expect("CORS error for origin."),
        )
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers([AUTHORIZATION, ACCEPT, CONTENT_TYPE]);
    let governor_config = GovernorConfigBuilder::default()
        .with_extractor(PeerIp::default())
        .expect_connect_info()
        .quota_default(Quota::requests_per_second(nz!(5u32)))
        .finish()
        .unwrap();
    let public_routes = Router::<AppState>::new()
        .route("/auth/google/login", get(google_login_handler))
        .route("/auth/google/signup", get(google_signup_handler))
        .route("/auth/google/callback", get(google_callback_handler))
        .route("/register", post(register_handler))
        .route("/login", post(classic_auth_handler))
        .route("/ping", get(ping_handler))
        .route("/search", get(searcher))
        .route("/artists/{artist_id}", get(get_artist_by_id_handler))
        .route(
            "/albums/{album_id}",
            get(get_album_by_id_handler).delete(delete_album_handler),
        )
        .route(
            "/songs/{song_id}/stream-url",
            get(get_song_stream_url_handler),
        )
        .route("/contact", post(contact_handler))
        .route("/ws", get(ws_handler))
        .layer(GovernorLayer::new(governor_config));

    let protected_routes = Router::<AppState>::new()
        .route(
            "/users",
            post(create_user_handler).get(get_all_users_handler),
        )
        .route("/users/me", get(get_me_handler))
        .route("/users/me/avatar", post(upload_avatar))
        .route(
            "/artists",
            get(get_artists_handler).post(create_artist_handler),
        )
        .route("/artist-requests", post(create_artist_request_handler))
        .route("/admin/artist-requests", get(get_artist_requests_handler))
        .route(
            "/admin/artist-requests/{request_id}",
            put(review_artist_request_handler),
        )
        .route(
            "/albums",
            get(get_my_albums_handler).post(create_album_handler),
        )
        .route("/songs", post(create_song_handler))
        .route("/songs/{song_id}/verify", put(verify_song_handler))
        .route(
            "/songs/{song_id}/like",
            post(like_song_handler).delete(unlike_song_handler),
        )
        .route("/songs/{id}", delete(delete_song_handler))
        .route("/liked-songs", get(get_liked_songs_handler))
        .route(
            "/playlists",
            get(get_my_playlists_handler).post(create_playlist_handler),
        )
        .route(
            "/playlists/{id}",
            get(get_playlist_by_id_handler)
                .put(update_playlist_handler)
                .delete(delete_playlist_handler),
        )
        .route(
            "/playlists/{playlist_id}/songs/{song_id}",
            post(add_song_to_playlist_handler).delete(remove_song_from_pl),
        )
        .route("/users/{id}", get(get_user_by_id_handler))
        .route(
            "/admin/artists/{artist_id}/albums",
            post(admin_create_album_for_artist_handler),
        )
        .route(
            "/messages/{other_user_id}",
            get(get_conversation_messages_handler),
        )
        .route(
            "/messages/{other_user_id}/read",
            put(mark_conversation_messages_as_read_handler),
        )
        .route("/conversations", get(get_conversations_handler))
        .layer(from_fn_with_state(state.clone(), auth_gate));

    let app = Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        .layer(DefaultBodyLimit::max(750 * 1024 * 1024))
        .layer(cors)
        .with_state(state)
        .merge(
            SwaggerUi::new("/swagger-ui").url("/api-docs/openapi.json", swagger::ApiDoc::openapi()),
        );

    let port = env::var("PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(8080);
    let listener_addr = format!("0.0.0.0:{port}");
    println!("B-Side engine starting on http://{listener_addr}");
    let listener = tokio::net::TcpListener::bind(&listener_addr)
        .await
        .unwrap_or_else(|error| panic!("Tokio bind listener failed for {listener_addr}: {error}"));
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await
    .expect("Axum failed to server Router with listener.");
}

async fn ensure_storage_buckets(client: &aws_sdk_s3::Client) -> Result<(), BSideError> {
    const BUCKETS: [&str; 3] = ["bside-tracks", "bside-covers", "bside-avatars"];

    for bucket in BUCKETS {
        let mut attempts = 0;

        loop {
            attempts += 1;

            if client.head_bucket().bucket(bucket).send().await.is_ok() {
                break;
            }

            match client.create_bucket().bucket(bucket).send().await {
                Ok(_) => break,
                Err(error) if attempts < 10 => {
                    eprintln!("Warning: bucket {bucket} is not ready yet ({error}); retrying...");
                    tokio::time::sleep(Duration::from_secs(2)).await;
                }
                Err(error) => {
                    return Err(BSideError::S3Error(format!(
                        "Failed to ensure bucket {bucket} after {attempts} attempts: {error}"
                    )));
                }
            }
        }
    }

    Ok(())
}
