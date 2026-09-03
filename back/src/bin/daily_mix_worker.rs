use bside::daily_mix::generate_missing_daily_mixes;
use bside::preferences::refresh_all_user_preferences;
use chrono::{Duration as ChronoDuration, NaiveDate, Utc};
use sqlx::postgres::PgPoolOptions;
use std::{env, time::Duration};

/// Parse an optional `--date YYYY-MM-DD` / `--date=YYYY-MM-DD` argument. When
/// present the worker builds mixes for that calendar date instead of "today"
/// and exits after one pass (useful for replaying / demoing consecutive nights).
fn parse_date_arg() -> Option<NaiveDate> {
    let mut args = env::args();
    while let Some(arg) = args.next() {
        if let Some(value) = arg.strip_prefix("--date=") {
            return NaiveDate::parse_from_str(value, "%Y-%m-%d").ok();
        }
        if arg == "--date" {
            return args
                .next()
                .and_then(|value| NaiveDate::parse_from_str(&value, "%Y-%m-%d").ok());
        }
    }
    None
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let pool = PgPoolOptions::new()
        .max_connections(3)
        .connect(&database_url)
        .await
        .expect("Daily Mix worker could not connect to PostgreSQL");
    let date_override = parse_date_arg();
    let run_once = date_override.is_some() || env::args().any(|argument| argument == "--once");

    loop {
        let now = Utc::now();
        let date = date_override.unwrap_or_else(|| now.date_naive());

        // Bring every user's preference vector up to date before ranking, so the
        // overnight mix reflects the latest like/play/skip history.
        match refresh_all_user_preferences(&pool).await {
            Ok((recomputed, cleared)) => println!(
                "Daily Mix worker refreshed preference vectors for {date}: {recomputed} recomputed, {cleared} cleared"
            ),
            Err(error) => eprintln!("Preference refresh failed for {date}: {error}"),
        }

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
