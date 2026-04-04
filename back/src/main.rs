mod models;
mod handlers;
use axum::{routing::{get, post}, Router };
use sqlx::{postgres::PgPoolOptions};
use std::env;
use crate::models::User;
use crate::models::UserPayload;
use crate::models::Song;
use crate::models::SongPayload;
use crate::handlers::{ping_handler, create_user_handler, get_all_users_handler, get_all_users_by_id_handler, create_song_handler};


#[tokio::main]
async fn main()
{

    dotenvy::dotenv().expect("Failed to read .env file");
    let db_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set.");
    println!("Connecting to the database ...");
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await
        .expect("Database connection established !");

    let app: Router = Router::new()
        .route("/ping", get(ping_handler))
        .route("/users", post(create_user_handler).get(get_all_users_handler))
        .route("/songs", post(create_song_handler))
        .route("/users/{id}", get(get_all_users_by_id_handler))
        .with_state(pool);
    let listener_addr = "0.0.0.0:8080";
    println!("Flacky engine starting on http://{}", listener_addr);
    let listener = tokio::net::TcpListener::bind(listener_addr)
        .await
        .unwrap();
    axum::serve(listener, app)
        .await
        .unwrap();

}


