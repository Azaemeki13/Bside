#![deny(clippy::unwrap_used)]
#![warn(clippy::pedantic)]
#![warn(clippy::nursery)]

mod auth;
mod error;
mod handlers;
mod models;
mod search;
use crate::auth::{Claims, auth_gate};
use crate::error::BSideError;
use crate::handlers::{
    add_song_to_playlist_handler, create_album_handler, create_playlist_handler,
    create_song_handler, create_user_handler, delete_playlist_handler, delete_song_handler,
    get_all_users_handler, get_me_handler, get_playlist_by_id_handler, get_user_by_id_handler,
    google_callback_handler, google_login_handler, ping_handler, remove_song_from_pl,
    update_playlist_handler, verify_song_handler,
};
use crate::models::{
    AddSongResponse, AlbumPayload, AlbumResponse, AppState, AuthRequest, GoogleUserProfile,
    Playlist, PlaylistDetailedResponse, PlaylistPayload, PlaylistSongItem, Song, SongPayload,
    SongResponse, UpdateStructurePayload, User, UserPayload, SearchResult, RawSearchResult,
};
use crate::search::searcher;

use axum::{
    Router,
    http::Method,
    middleware::from_fn_with_state,
    routing::{delete, get, post, put},
};
use oauth2::{AuthUrl, ClientId, ClientSecret, RedirectUrl, TokenUrl, basic::BasicClient};
use sqlx::postgres::PgPoolOptions;
use std::env;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};

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
    let state = AppState {
        db: pool,
        oauth_client: client,
        http_client: reqwest::Client::new(),
        jwt: Arc::new(secrecy::SecretBox::new(jwt_secret.into())),
        aws_client,
    };

    let cors = CorsLayer::new()
        .allow_origin(Any) // to replace w/ frontend URL
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers(Any);

    let public_routes = Router::<AppState>::new()
        .route("/auth/google/login", get(google_login_handler))
        .route("/auth/google/callback", get(google_callback_handler))
        .route("/ping", get(ping_handler))
        .route("/search", get(searcher));

    let protected_routes = Router::<AppState>::new()
        .route(
            "/users",
            post(create_user_handler).get(get_all_users_handler),
        )
        .route("/users/me", get(get_me_handler))
        .route("/albums", post(create_album_handler))
        .route("/songs", post(create_song_handler))
        .route("/songs/{song_id}/verify", put(verify_song_handler))
        .route("/songs/{id}", delete(delete_song_handler))
        .route("/playlists", post(create_playlist_handler))
        .route(
            "/playlists/{id}",
            get(get_playlist_by_id_handler)
                .put(update_playlist_handler)
                .delete(delete_playlist_handler),
        )
        .route(
            "/playlists/{playlist_id}/songs/{song_id}",
            post(add_song_to_playlist_handler)
            .delete(remove_song_from_pl),
        )
        .route("/users/{id}", get(get_user_by_id_handler))
        .layer(from_fn_with_state(state.clone(), auth_gate));

    let app: Router = Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        .layer(cors)
        .with_state(state);

    let listener_addr = "0.0.0.0:8080";
    println!("B-Side engine starting on http://{listener_addr}");
    let listener = tokio::net::TcpListener::bind(listener_addr)
        .await
        .expect("Tokio bind listener failed !");
    axum::serve(listener, app)
        .await
        .expect("Axum failed to server Router with listener.");
}
