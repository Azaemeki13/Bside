//! Friends: requests, acceptance/rejection, the friend list (with live
//! presence from [`crate::network`]), and real-time notifications pushed
//! over the [`crate::ws`] websocket.

use crate::ws::{
    notify_friend_removed, notify_friend_request_accepted, notify_friend_request_received,
    notify_friend_request_rejected,
};
use crate::models::{FriendListItem, FriendRequestItem, FriendRequestsResponse, UserStatusResponse};
use crate::{AppState, BSideError, Claims};
use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use uuid::Uuid;

pub async fn get_friends_handler(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<Vec<FriendListItem>>, BSideError> {
    let current_user_id = claims.sub;

    let rows = sqlx::query!(
        r#"
        SELECT
            f.id AS "friendship_id!",
            u.id AS "user_id!",
            u.username AS "username!",
            u.display_name,
            u.email AS "email!",
            u.avatar_url,
            u.role AS "role!",
            f.created_at AS "friendship_created_at!"
        FROM friendships f
        JOIN users u ON u.id = CASE
            WHEN f.requester_id = $1 THEN f.addressee_id
            ELSE f.requester_id
        END
        WHERE
            (f.requester_id = $1 OR f.addressee_id = $1)
            AND f.status = 'accepted'
        ORDER BY u.username ASC
        "#,
        current_user_id
    )
    .fetch_all(&state.db)
    .await?;

    let mut friends = Vec::with_capacity(rows.len());
    for row in rows {
        friends.push(FriendListItem {
            friendship_id: row.friendship_id,
            user_id: row.user_id,
            username: row.username,
            display_name: row.display_name,
            email: row.email,
            avatar_url: row.avatar_url,
            role: row.role,
            is_online: state.network.is_online(row.user_id).await,
            friendship_created_at: row.friendship_created_at,
        });
    }

    Ok(Json(friends))
}

pub async fn send_friend_request_handler(
    State(state): State<AppState>,
    claims: Claims,
    Path(target_user_id): Path<Uuid>,
) -> Result<Json<FriendRequestItem>, BSideError> {
    let current_user_id = claims.sub;

    if current_user_id == target_user_id {
        return Err(BSideError::BadRequest(
            "You cannot add yourself as a friend.".into(),
        ));
    }

    let target_exists = sqlx::query_scalar!(
        "SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)",
        target_user_id
    )
    .fetch_one(&state.db)
    .await?
    .unwrap_or(false);

    if !target_exists {
        return Err(BSideError::UserNotFound);
    }

    let existing = sqlx::query!(
        r#"
        SELECT id, requester_id, addressee_id, status
        FROM friendships
        WHERE
            (requester_id = $1 AND addressee_id = $2)
            OR
            (requester_id = $2 AND addressee_id = $1)
        "#,
        current_user_id,
        target_user_id
    )
    .fetch_optional(&state.db)
    .await?;

    if let Some(friendship) = existing {
        if friendship.status == "accepted" {
            return Err(BSideError::Conflict("You are already friends.".into()));
        }

        if friendship.status == "pending" {
            return Err(BSideError::Conflict(
                "A friend request is already pending.".into(),
            ));
        }

        sqlx::query!(
            r#"
            UPDATE friendships
            SET requester_id = $1,
                addressee_id = $2,
                status = 'pending',
                updated_at = NOW()
            WHERE id = $3
            "#,
            current_user_id,
            target_user_id,
            friendship.id
        )
        .execute(&state.db)
        .await?;

        let item = fetch_friend_request_item(&state, friendship.id).await?;
        notify_friend_request_received(&state, target_user_id, item.friendship_id, current_user_id)
            .await;
        return Ok(Json(item));
    }

    let friendship_id = Uuid::new_v4();

    sqlx::query!(
        r#"
        INSERT INTO friendships (id, requester_id, addressee_id, status)
        VALUES ($1, $2, $3, 'pending')
        "#,
        friendship_id,
        current_user_id,
        target_user_id
    )
    .execute(&state.db)
    .await?;

    let item = fetch_friend_request_item(&state, friendship_id).await?;
    notify_friend_request_received(&state, target_user_id, item.friendship_id, current_user_id)
        .await;
    Ok(Json(item))
}

pub async fn get_friend_requests_handler(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<FriendRequestsResponse>, BSideError> {
    let current_user_id = claims.sub;

    let requests = sqlx::query_as!(
        FriendRequestItem,
        r#"
        SELECT
            f.id AS "friendship_id!",
            f.requester_id AS "requester_id!",
            requester.username AS "requester_username!",
            requester.display_name AS requester_display_name,
            requester.avatar_url AS requester_avatar_url,

            f.addressee_id AS "addressee_id!",
            addressee.username AS "addressee_username!",
            addressee.display_name AS addressee_display_name,
            addressee.avatar_url AS addressee_avatar_url,

            f.status AS "status!",
            f.created_at AS "created_at!"
        FROM friendships f
        JOIN users requester ON requester.id = f.requester_id
        JOIN users addressee ON addressee.id = f.addressee_id
        WHERE
            f.status = 'pending'
            AND (f.requester_id = $1 OR f.addressee_id = $1)
        ORDER BY f.created_at DESC
        "#,
        current_user_id
    )
    .fetch_all(&state.db)
    .await?;

    let mut incoming = Vec::new();
    let mut outgoing = Vec::new();

    for request in requests {
        if request.addressee_id == current_user_id {
            incoming.push(request);
        } else {
            outgoing.push(request);
        }
    }

    Ok(Json(FriendRequestsResponse { incoming, outgoing }))
}

pub async fn accept_friend_request_handler(
    State(state): State<AppState>,
    claims: Claims,
    Path(friendship_id): Path<Uuid>,
) -> Result<Json<FriendRequestItem>, BSideError> {
    let current_user_id = claims.sub;

    let updated = sqlx::query!(
        r#"
        UPDATE friendships
        SET status = 'accepted',
            updated_at = NOW()
        WHERE
            id = $1
            AND addressee_id = $2
            AND status = 'pending'
        RETURNING id
        "#,
        friendship_id,
        current_user_id
    )
    .fetch_optional(&state.db)
    .await?;

    if updated.is_none() {
        return Err(BSideError::NotFound);
    }

    let item = fetch_friend_request_item(&state, friendship_id).await?;
    notify_friend_request_accepted(
        &state,
        item.requester_id,
        item.friendship_id,
        current_user_id,
    )
    .await;
    Ok(Json(item))
}

pub async fn reject_friend_request_handler(
    State(state): State<AppState>,
    claims: Claims,
    Path(friendship_id): Path<Uuid>,
) -> Result<Json<FriendRequestItem>, BSideError> {
    let current_user_id = claims.sub;

    let updated = sqlx::query!(
        r#"
        UPDATE friendships
        SET status = 'rejected',
            updated_at = NOW()
        WHERE
            id = $1
            AND addressee_id = $2
            AND status = 'pending'
        RETURNING id
        "#,
        friendship_id,
        current_user_id
    )
    .fetch_optional(&state.db)
    .await?;

    if updated.is_none() {
        return Err(BSideError::NotFound);
    }

    let item = fetch_friend_request_item(&state, friendship_id).await?;
    notify_friend_request_rejected(
        &state,
        item.requester_id,
        item.friendship_id,
        current_user_id,
    )
    .await;
    Ok(Json(item))
}

pub async fn remove_friend_handler(
    State(state): State<AppState>,
    claims: Claims,
    Path(other_user_id): Path<Uuid>,
) -> Result<impl IntoResponse, BSideError> {
    let current_user_id = claims.sub;

    let mut tx = state.db.begin().await?;

    let deleted = sqlx::query!(
        r#"
        DELETE FROM friendships
        WHERE
            (requester_id = $1 AND addressee_id = $2)
            OR
            (requester_id = $2 AND addressee_id = $1)
        RETURNING id
        "#,
        current_user_id,
        other_user_id
    )
    .fetch_optional(&mut *tx)
    .await?;

    if deleted.is_none() {
        return Err(BSideError::NotFound);
    }

    sqlx::query!(
        r#"
        DELETE FROM messages
        WHERE
            (sender_id = $1 AND receiver_id = $2)
            OR
            (sender_id = $2 AND receiver_id = $1)
        "#,
        current_user_id,
        other_user_id
    )
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    notify_friend_removed(&state, other_user_id, current_user_id).await;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn get_user_status_handler(
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
    _claims: Claims,
) -> Result<Json<UserStatusResponse>, BSideError> {
    let user_exists =
        sqlx::query_scalar!("SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)", user_id)
            .fetch_one(&state.db)
            .await?
            .unwrap_or(false);

    if !user_exists {
        return Err(BSideError::UserNotFound);
    }

    Ok(Json(UserStatusResponse {
        user_id,
        is_online: state.network.is_online(user_id).await,
    }))
}

async fn fetch_friend_request_item(
    state: &AppState,
    friendship_id: Uuid,
) -> Result<FriendRequestItem, BSideError> {
    let request = sqlx::query_as!(
        FriendRequestItem,
        r#"
        SELECT
            f.id AS "friendship_id!",
            f.requester_id AS "requester_id!",
            requester.username AS "requester_username!",
            requester.display_name AS requester_display_name,
            requester.avatar_url AS requester_avatar_url,

            f.addressee_id AS "addressee_id!",
            addressee.username AS "addressee_username!",
            addressee.display_name AS addressee_display_name,
            addressee.avatar_url AS addressee_avatar_url,

            f.status AS "status!",
            f.created_at AS "created_at!"
        FROM friendships f
        JOIN users requester ON requester.id = f.requester_id
        JOIN users addressee ON addressee.id = f.addressee_id
        WHERE f.id = $1
        "#,
        friendship_id
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or(BSideError::NotFound)?;

    Ok(request)
}
