use crate::{ApiError, auth, db_error};
use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, put},
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

pub fn routes() -> Router<PgPool> {
    Router::new()
        .route("/api/workspaces/{workspace}/projects", get(list))
        .route("/api/workspaces/{workspace}/projects/{id}", put(save))
}

#[derive(Serialize, sqlx::FromRow)]
struct Project {
    id: Uuid,
    name: String,
}

async fn list(
    State(pool): State<PgPool>,
    Path(workspace): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<Vec<Project>>, ApiError> {
    auth::authorize(&pool, &headers, workspace).await?;
    Ok(Json(
        sqlx::query_as("SELECT id, name FROM projects WHERE workspace_id=$1 ORDER BY name, id")
            .bind(workspace)
            .fetch_all(&pool)
            .await
            .map_err(db_error)?,
    ))
}

#[derive(Deserialize)]
struct ProjectName {
    name: String,
}

async fn save(
    State(pool): State<PgPool>,
    Path((workspace, id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Json(input): Json<ProjectName>,
) -> Result<Json<Project>, ApiError> {
    auth::authorize(&pool, &headers, workspace).await?;
    let name = input.name.trim();
    if !(1..=100).contains(&name.chars().count()) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Enter a project name of 1 to 100 characters.",
        ));
    }
    Ok(Json(
        sqlx::query_as(
            "INSERT INTO projects (workspace_id, id, name) VALUES ($1,$2,$3)
        ON CONFLICT (workspace_id,id) DO UPDATE SET name=excluded.name RETURNING id,name",
        )
        .bind(workspace)
        .bind(id)
        .bind(name)
        .fetch_one(&pool)
        .await
        .map_err(db_error)?,
    ))
}
