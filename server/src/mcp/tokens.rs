use crate::{ApiError, auth, db_error};
use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

pub fn routes() -> Router<PgPool> {
    Router::new().route(
        "/api/workspaces/{workspace}/mcp-token",
        get(status).post(create).delete(revoke),
    )
}

async fn status(
    State(pool): State<PgPool>,
    Path(workspace): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    auth::authorize(&pool, &headers, workspace).await?;
    let active: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM mcp_tokens WHERE workspace_id=$1)")
            .bind(workspace)
            .fetch_one(&pool)
            .await
            .map_err(db_error)?;
    Ok((
        [(header::CACHE_CONTROL, "no-store")],
        Json(json!({ "active": active })),
    )
        .into_response())
}

async fn create(
    State(pool): State<PgPool>,
    Path(workspace): Path<Uuid>,
    headers: HeaderMap,
    Json(_): Json<serde_json::Map<String, serde_json::Value>>,
) -> Result<Response, ApiError> {
    auth::authorize(&pool, &headers, workspace).await?;
    let secret = Uuid::new_v4();
    let result = sqlx::query("INSERT INTO mcp_tokens(workspace_id,digest) VALUES ($1,sha256(uuid_send($2))) ON CONFLICT(workspace_id) DO NOTHING")
        .bind(workspace).bind(secret).execute(&pool).await.map_err(db_error)?;
    if result.rows_affected() == 0 {
        return Err((
            StatusCode::CONFLICT,
            "Revoke the current MCP token before creating another.",
        ));
    }
    Ok((
        StatusCode::CREATED,
        [(header::CACHE_CONTROL, "no-store")],
        Json(json!({ "token": format!("slm_{secret}") })),
    )
        .into_response())
}

async fn revoke(
    State(pool): State<PgPool>,
    Path(workspace): Path<Uuid>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    auth::authorize(&pool, &headers, workspace).await?;
    sqlx::query("DELETE FROM mcp_tokens WHERE workspace_id=$1")
        .bind(workspace)
        .execute(&pool)
        .await
        .map_err(db_error)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn workspace(pool: &PgPool, headers: &HeaderMap) -> Result<Option<Uuid>, ApiError> {
    let Some(secret) = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split_once(' '))
        .filter(|(scheme, _)| scheme.eq_ignore_ascii_case("Bearer"))
        .and_then(|(_, token)| token.strip_prefix("slm_"))
        .and_then(|secret| Uuid::parse_str(secret).ok())
    else {
        return Ok(None);
    };
    sqlx::query_scalar("SELECT workspace_id FROM mcp_tokens WHERE digest=sha256(uuid_send($1))")
        .bind(secret)
        .fetch_optional(pool)
        .await
        .map_err(db_error)
}
