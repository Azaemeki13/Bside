use crate::{AnyAuth, AppState, BSideError, RawSearchResult, SearchResponse, SearchResult};
use axum::Json;
use axum::extract::{Query, State};

#[derive(Debug, serde::Deserialize, utoipa::IntoParams)]
pub struct SearchParams {
    q: String,
    #[serde(default = "default_entity_type")]
    entity_type: String,
    #[serde(default = "default_sort")]
    sort: String,
    #[serde(default = "default_page")]
    page: i64,
    #[serde(default = "default_page_size")]
    page_size: i64,
}

fn default_entity_type() -> String {
    "all".into()
}
fn default_sort() -> String {
    "relevance".into()
}
const fn default_page() -> i64 {
    1
}
const fn default_page_size() -> i64 {
    10
}

#[utoipa::path(
    get,
    path = "/search",
    params(SearchParams),
    responses(
        (status = 200, description = "Filtered, sorted, paginated results from songs, albums, artists, and playlists", body = SearchResponse),
        (status = 400, description = "Missing or invalid query parameter"),
        (status = 500, description = "Internal server error"),
    ),
    tags = ["Search"]
)]
pub async fn searcher(
    State(state): State<AppState>,
    Query(params): Query<SearchParams>,
    _auth: AnyAuth,
) -> Result<Json<SearchResponse>, BSideError> {
    let query = params.q.trim();
    if !(2..=100).contains(&query.chars().count()) {
        return Err(BSideError::BadRequest(
            "Search query must be 2-100 characters.".into(),
        ));
    }
    if !matches!(
        params.entity_type.as_str(),
        "all" | "song" | "album" | "artist" | "playlist"
    ) {
        return Err(BSideError::BadRequest("Invalid search entity type.".into()));
    }
    if !matches!(params.sort.as_str(), "relevance" | "name_asc" | "name_desc") {
        return Err(BSideError::BadRequest("Invalid search sort.".into()));
    }
    if params.page < 1 || !(1..=50).contains(&params.page_size) {
        return Err(BSideError::BadRequest(
            "Page must be positive and page_size must be 1-50.".into(),
        ));
    }
    let offset = (params.page - 1)
        .checked_mul(params.page_size)
        .ok_or_else(|| BSideError::BadRequest("Pagination is too large.".into()))?;
    let rows = sqlx::query_as::<_, RawSearchResult>(
    r#"
    WITH candidates AS (
    -- 1 Songs
        SELECT s.id, s.title as name, 'song' as entity_type, ar.name as metadata, s.audio_url, s.album_id,
            to_tsvector('english', unaccent(s.title) || ' ' || unaccent(ar.name)) as doc,
            (unaccent(s.title) || ' ' || unaccent(ar.name)) as raw_text
        FROM songs s
        JOIN albums a ON s.album_id = a.id
        JOIN artists ar ON a.artist_id = ar.id
        WHERE s.status = 'Ready'
        
        UNION ALL
        
    -- 2 Albums
        SELECT a.id, a.title as name, 'album' as entity_type, ar.name as metadata, NULL as audio_url, a.id as album_id,
            to_tsvector('english', unaccent(a.title) || ' ' || unaccent(ar.name)) as doc,
            (unaccent(a.title) || ' ' || unaccent(ar.name)) as raw_text
        FROM albums a
        JOIN artists ar ON a.artist_id = ar.id
        WHERE a.status = 'Ready'
        
    -- 3 Artists 
        UNION ALL
        SELECT id, name, 'artist' as entity_type, NULL as metadata, NULL as audio_url, id as album_id,
            to_tsvector('english', unaccent(name)) as doc,
            unaccent(name) as raw_text
        FROM artists
        WHERE status = 'Ready'
        
    -- 4 Playlists
        UNION ALL
        SELECT p.id, p.title as name, 'playlist' as entity_type, u.username as metadata, NULL as audio_url, p.id as album_id,
            to_tsvector('english', unaccent(p.title) || ' ' || unaccent(u.username)) as doc,
            (unaccent(p.title) || ' ' || unaccent(u.username)) as raw_text
        FROM playlists p
        JOIN users u ON p.owner_id = u.id
        WHERE p.is_public = true
    )
    , ranked AS (
        SELECT id, name, entity_type, metadata, audio_url, album_id,
        (
            ts_rank(doc, websearch_to_tsquery('english', $1)) * 0.6 + 
            GREATEST(similarity(raw_text, $1), similarity(COALESCE(metadata, ''), $1)) * 0.4
        )::float8 AS rank
        FROM candidates
        WHERE (doc @@ websearch_to_tsquery('english', $1)
            OR name % $1
            OR COALESCE(metadata, '') % $1
            OR strpos(lower(raw_text), lower(unaccent($1))) > 0)
          AND ($2 = 'all' OR entity_type = $2)
    )
    SELECT id, name, entity_type, metadata, audio_url, album_id, rank,
           COUNT(*) OVER() AS total_count
    FROM ranked
    ORDER BY
        CASE WHEN $3 = 'relevance' THEN rank END DESC,
        CASE WHEN $3 = 'name_asc' THEN LOWER(name) END ASC,
        CASE WHEN $3 = 'name_desc' THEN LOWER(name) END DESC,
        id
    LIMIT $4 OFFSET $5
    "#,
    )
    .bind(query)
    .bind(&params.entity_type)
    .bind(&params.sort)
    .bind(params.page_size)
    .bind(offset)
    .fetch_all(&state.db)
    .await?;

    if rows.is_empty() && params.page > 1 {
        return Err(BSideError::BadRequest(
            "Requested page exceeds the available search results.".into(),
        ));
    }

    let total = rows.first().map_or(0, |row| row.total_count);

    let results = rows
        .into_iter()
        .map(|row| match row.entity_type.as_str() {
            "song" => SearchResult::Song {
                id: row.id,
                title: row.name,
                artist: row.metadata.unwrap_or_default(),
                audio_url: row.audio_url.unwrap_or_default(),
                album_id: row.album_id,
            },
            "album" => SearchResult::Album {
                id: row.id,
                name: row.name,
                artist: row.metadata.unwrap_or_default(),
            },
            "playlist" => SearchResult::Playlist {
                id: row.id,
                name: row.name,
                creator: row.metadata.unwrap_or_else(|| "Unknown".to_string()),
            },
            _ => SearchResult::Artist {
                id: row.id,
                name: row.name,
            },
        })
        .collect();

    Ok(Json(SearchResponse {
        results,
        page: params.page,
        page_size: params.page_size,
        total,
        total_pages: if total == 0 {
            0
        } else {
            (total + params.page_size - 1) / params.page_size
        },
    }))
}
