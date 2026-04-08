mod auth;
mod handlers;
mod models;
use crate::auth::Claims;
use crate::handlers::{
    add_song_to_playlist_handler, create_playlist_handler, create_song_handler,
    create_user_handler, get_all_users_handler, get_playlist_by_id_handler, get_user_by_id_handler,
    google_callback_handler, google_login_handler, ping_handler,
};
use crate::models::AppState;
use crate::models::AuthRequest;
use crate::models::GoogleUserProfile;
use crate::models::Playlist;
use crate::models::PlaylistPayload;
use crate::models::PlaylistResponse;
use crate::models::Song;
use crate::models::SongPayload;
use crate::models::User;
use crate::models::UserPayload;
use axum::{
    Router,
    http::Method,
    routing::{get, post},
};
use oauth2::{AuthUrl, ClientId, ClientSecret, RedirectUrl, TokenUrl, basic::BasicClient};
use sqlx::postgres::PgPoolOptions;
use std::env;
use tower_http::cors::{Any, CorsLayer};
#[tokio::main]
async fn main() {
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

    let client = BasicClient::new(ClientId::new(client_id))
        .set_client_secret(ClientSecret::new(client_pw))
        .set_auth_uri(AuthUrl::new(auth_uri).expect("Invalid auth URL"))
        .set_token_uri(TokenUrl::new(token_uri).expect("Invalid token URL"))
        .set_redirect_uri(RedirectUrl::new(redirect_url).expect("Invalid redirect URL"));

    let state = AppState {
        db: pool,
        oauth_client: client,
        http_client: reqwest::Client::new(),
    };

    let cors = CorsLayer::new()
        .allow_origin(Any) // to replace w/ frontend URL
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers(Any);

    let app: Router = Router::new()
        .route("/auth/google/login", get(google_login_handler))
        .route("/auth/google/callback", get(google_callback_handler))
        .route("/ping", get(ping_handler))
        .route(
            "/users",
            post(create_user_handler).get(get_all_users_handler),
        )
        .route("/songs", post(create_song_handler))
        .route("/playlists", post(create_playlist_handler))
        .route("/playlists/{id}", get(get_playlist_by_id_handler))
        .route(
            "/playlists/{playlist_id}/songs/{song_id}",
            post(add_song_to_playlist_handler),
        )
        .route("/users/{id}", get(get_user_by_id_handler))
        .layer(cors)
        .with_state(state);

    let listener_addr = "0.0.0.0:8080";
    println!("B-Side engine starting on http://{}", listener_addr);
    let listener = tokio::net::TcpListener::bind(listener_addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
