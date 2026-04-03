use axum::{
    routing::get,
    Router,
    response::Json,
    extract::State,
};

use serde::Serialize;
use sqlx::{postgres::PgPoolOptions, PgPool};
use std::env;

#[derive(Serialize)]
struct PingResponse
{
    status: String,
    message: String,
}

#[tokio::main]
async fn main()
{
    dotenvy::from_path("../.env").expect("Failed to read .env file");
    let db_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set.");
    println!("Connecting to the database ...");
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await
        .expect("Database connection established !");

    let app: Router = Router::new()
        .route("/ping", get(ping_handler))
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
