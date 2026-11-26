use crate::{ApiError, auth, db_error, mail::MailTransport};
use axum::{
    Extension, Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode, header},
    routing::{delete, get},
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

pub fn routes(mail: MailTransport) -> Router<PgPool> {
    Router::new()
        .route(
            "/api/workspaces/{workspace}/teammates",
            get(list).post(invite),
        )
        .route("/api/workspaces/{workspace}/teammates/{id}", delete(remove))
        .layer(Extension(mail))
}

#[derive(Serialize, sqlx::FromRow)]
struct Teammate {
    id: Uuid,
    email: String,
    pending: bool,
}

async fn list(
    State(pool): State<PgPool>,
    Path(workspace): Path<Uuid>,
    headers: HeaderMap,
) -> Result<impl axum::response::IntoResponse, ApiError> {
    auth::authorize_owner(&pool, &headers, workspace).await?;
    let rows = sqlx::query_as::<_, Teammate>(
        "SELECT id, email, member_id IS NULL AS pending FROM workspace_teammates
         WHERE workspace_id=$1 ORDER BY email",
    )
    .bind(workspace)
    .fetch_all(&pool)
    .await
    .map_err(db_error)?;
    Ok(([(header::CACHE_CONTROL, "no-store")], Json(rows)))
}

#[derive(Deserialize)]
struct Invitation {
    email: String,
}

async fn invite(
    State(pool): State<PgPool>,
    Path(workspace): Path<Uuid>,
    headers: HeaderMap,
    Extension(mail): Extension<MailTransport>,
    Json(input): Json<Invitation>,
) -> Result<StatusCode, ApiError> {
    let owner = auth::authorize_owner(&pool, &headers, workspace).await?;
    let email = auth::normalize(&input.email)?;
    if email == owner {
        return Err((StatusCode::BAD_REQUEST, "You already own this workspace."));
    }

    let mut tx = pool.begin().await.map_err(db_error)?;
    let inserted = sqlx::query(
        "INSERT INTO workspace_teammates(id, workspace_id, email)
        VALUES ($1,$2,$3) ON CONFLICT (workspace_id,email) DO NOTHING",
    )
    .bind(Uuid::new_v4())
    .bind(workspace)
    .bind(&email)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    let status = if inserted.rows_affected() == 1 {
        let body = format!(
            "{owner} invited you to their Engineering workspace in Sync Line. Accepting gives you read and edit access to all issues in that workspace, including existing issues. This invitation is for {email}."
        );
        mail.deliver(&email, "Sync Line workspace invitation", &body)
            .await
            .map_err(|error| {
                eprintln!("Could not deliver workspace invitation: {error}");
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    "Couldn’t deliver the invitation. Try again.",
                )
            })?;
        StatusCode::CREATED
    } else {
        StatusCode::NO_CONTENT
    };
    tx.commit().await.map_err(db_error)?;
    Ok(status)
}

async fn remove(
    State(pool): State<PgPool>,
    Path((workspace, id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    auth::authorize_owner(&pool, &headers, workspace).await?;
    sqlx::query("DELETE FROM workspace_teammates WHERE workspace_id=$1 AND id=$2")
        .bind(workspace)
        .bind(id)
        .execute(&pool)
        .await
        .map_err(db_error)?;
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::tests::sign_in;

    #[sqlx::test]
    async fn only_the_owner_manages_teammates_and_invitation_retries_coalesce(pool: PgPool) {
        let (workspace, owner) = sign_in(&pool, "owner@example.test").await;
        let (member, other) = sign_in(&pool, "member@example.test").await;
        let send = |headers, email: &str| {
            invite(
                State(pool.clone()),
                Path(workspace),
                headers,
                Extension(MailTransport::Logger),
                Json(Invitation {
                    email: email.into(),
                }),
            )
        };
        assert_eq!(
            send(owner.clone(), " OWNER@example.test ")
                .await
                .unwrap_err()
                .0,
            StatusCode::BAD_REQUEST
        );
        let (first, retry) = tokio::join!(
            send(owner.clone(), " Member@example.test "),
            send(owner.clone(), "member@example.test")
        );
        let mut statuses = [first.unwrap(), retry.unwrap()];
        statuses.sort();
        assert_eq!(statuses, [StatusCode::CREATED, StatusCode::NO_CONTENT]);
        let rows: Vec<(Uuid, Option<Uuid>)> =
            sqlx::query_as("SELECT id, member_id FROM workspace_teammates WHERE workspace_id=$1")
                .bind(workspace)
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(rows.len(), 1);
        let (id, member_id) = rows[0];
        assert!(member_id.is_none());

        sqlx::query("UPDATE workspace_teammates SET member_id=$1 WHERE id=$2")
            .bind(member)
            .bind(id)
            .execute(&pool)
            .await
            .unwrap();
        assert!(
            list(State(pool.clone()), Path(workspace), other.clone())
                .await
                .is_err()
        );
        assert!(send(other.clone(), "another@example.test").await.is_err());
        let remove_from =
            |workspace, headers| remove(State(pool.clone()), Path((workspace, id)), headers);
        assert!(remove_from(workspace, other.clone()).await.is_err());
        remove_from(member, other).await.unwrap();
        let remains: bool =
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM workspace_teammates WHERE id=$1)")
                .bind(id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert!(remains);
        remove_from(workspace, owner).await.unwrap();
        let count: i64 =
            sqlx::query_scalar("SELECT count(*) FROM workspace_teammates WHERE workspace_id=$1")
                .bind(workspace)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(count, 0);
    }
}
