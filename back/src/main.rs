mod models;
mod handlers;
use axum::{routing::{get, post}, Router, response::Json, extract::State,};
// use serde::{Serialize, Deserialize};
use sqlx::{postgres::PgPoolOptions, PgPool};
use std::env;
use crate::models::PingResponse;
use crate::models::User;
use crate::models::UserPayload;
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
        .route("/users", post(create_user_handler))
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

async fn ping_handler(State(_pool): State<PgPool>) -> Json<PingResponse> 
{
    let response = PingResponse
    {
        status: "success".to_string(),
        message: "Rust Engine is online".to_string(),

    };
    Json(response)
}
#[axum::debug_handler]
async fn create_user_handler(State(pool): State<PgPool>,
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
