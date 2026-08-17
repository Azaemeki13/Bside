use bside::daily_mix::generate_missing_daily_mixes;
use chrono::{Duration as ChronoDuration, Utc};
use sqlx::postgres::PgPoolOptions;
use std::{env, time::Duration};

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let pool = PgPoolOptions::new()
        .max_connections(3)
        .connect(&database_url)
        .await
        .expect("Daily Mix worker could not connect to PostgreSQL");
    let run_once = env::args().any(|argument| argument == "--once");

    loop {
        let now = Utc::now();
        let date = now.date_naive();
        match generate_missing_daily_mixes(&pool, date).await {
            Ok(count) => {
                println!("Daily Mix worker generated {count} mix(es) for {date}");
                let summaries = sqlx::query_as::<_, (String, i64, i64, i64)>(
                    r#"SELECT u.username, COUNT(dms.id),
                              COUNT(dms.id) FILTER (WHERE dms.is_discovery),
                              COUNT(dms.id) FILTER (WHERE NOT dms.is_discovery)
                       FROM daily_mixes dm
                       JOIN users u ON u.id = dm.user_id
                       LEFT JOIN daily_mix_songs dms ON dms.daily_mix_id = dm.id
                       WHERE dm.generation_date = $1
                       GROUP BY u.username
                       ORDER BY u.username"#,
                )
                .bind(date)
                .fetch_all(&pool)
                .await
                .unwrap_or_default();
                for (username, tracks, discovery, familiar) in summaries {
                    println!(
                        "Daily Mix {username}: {tracks} tracks ({discovery} discovery, {familiar} familiar)"
                    );
                }
            }
            Err(error) => eprintln!("Daily Mix generation failed for {date}: {error}"),
        }
        if run_once {
            break;
        }

        let next_run = (date + ChronoDuration::days(1))
            .and_hms_opt(4, 0, 0)
            .expect("04:00 is a valid UTC time")
            .and_utc();
        let sleep_for = (next_run - Utc::now())
            .to_std()
            .unwrap_or(Duration::from_secs(60));
        tokio::time::sleep(sleep_for).await;
    }
}
