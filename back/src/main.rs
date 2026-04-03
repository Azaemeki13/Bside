use axum::{
    routing::get,
    Router,
    response::Json,
};

use serde::Serialize;

#[derive(Serialize)]
struct PingResponse
{
    status: String,
    message: String,
}

#[tokio::main]
async fn main()
{
    let app: Router = Router::new()
        .route("/ping", get(ping_handler));
    let listener_addr = "0.0.0.0:8080";
    println!("Flacky engine starting on http://{}", listener_addr);
    let listener = tokio::net::TcpListener::bind(listener_addr)
        .await
        .unwrap();
    axum::serve(listener, app)
        .await
        .unwrap();

}

async fn ping_handler() -> Json<PingResponse> 
{
    let response = PingResponse
    {
        status: "success".to_string(),
        message: "Rust Engine is online".to_string(),

    };
    Json(response)
}
