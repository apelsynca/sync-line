mod auth;

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Path, State},
    http::{HeaderMap, StatusCode, header},
    routing::{get, put},
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

type ApiError = (StatusCode, &'static str);

#[derive(Deserialize, Serialize, sqlx::FromRow)]
struct Fields {
    title: String,
    description: String,
    status: String,
    assignee: String,
    priority: String,
}

impl Fields {
    fn validate(&self) -> Result<(), ApiError> {
        if self.title.trim().is_empty()
            || self.title.chars().count() > 200
            || !["Todo", "In progress", "Done"].contains(&self.status.as_str())
            || !["", "Me"].contains(&self.assignee.as_str())
            || !["Low", "Medium", "High"].contains(&self.priority.as_str())
        {
            return Err((
                StatusCode::BAD_REQUEST,
                "Check the title and issue properties.",
            ));
        }
        Ok(())
    }
}

#[derive(Serialize, sqlx::FromRow)]
struct Issue {
    id: Uuid,
    number: i32,
    #[serde(flatten)]
    #[sqlx(flatten)]
    fields: Fields,
}

fn db_error(error: sqlx::Error) -> ApiError {
    eprintln!("Database error: {error}");
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        "Database unavailable. Please retry.",
    )
}

async fn issues(
    State(pool): State<PgPool>,
    Path(workspace): Path<Uuid>,
    headers: HeaderMap,
) -> Result<impl axum::response::IntoResponse, ApiError> {
    auth::authorize(&pool, &headers, workspace).await?;
    let issues = sqlx::query_as::<_, Issue>(
        "SELECT request_id AS id, * FROM issues WHERE workspace_id=$1 ORDER BY number",
    )
    .bind(workspace)
    .fetch_all(&pool)
    .await
    .map_err(db_error)?;
    Ok(([(header::CACHE_CONTROL, "no-store")], Json(issues)))
}

async fn save(
    State(pool): State<PgPool>,
    Path((workspace, id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Json(fields): Json<Fields>,
) -> Result<Json<i32>, ApiError> {
    auth::authorize(&pool, &headers, workspace).await?;
    fields.validate()?;
    let mut tx = pool.begin().await.map_err(db_error)?;
    // Serialize first inserts and retries so an issue only consumes one number.
    let next: i32 = sqlx::query_scalar("SELECT next_number FROM workspaces WHERE id=$1 FOR UPDATE")
        .bind(workspace)
        .fetch_one(&mut *tx)
        .await
        .map_err(db_error)?;
    let number: i32 = sqlx::query_scalar("INSERT INTO issues(workspace_id, request_id, number, title, description, status, priority, assignee)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(workspace_id,request_id) DO UPDATE SET
        title=excluded.title, description=excluded.description, status=excluded.status,
        priority=excluded.priority, assignee=excluded.assignee RETURNING number")
        .bind(workspace).bind(id).bind(next).bind(fields.title).bind(fields.description).bind(fields.status).bind(fields.priority).bind(fields.assignee)
        .fetch_one(&mut *tx).await.map_err(db_error)?;
    if number == next {
        sqlx::query("UPDATE workspaces SET next_number=next_number+1 WHERE id=$1")
            .bind(workspace)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
    }
    tx.commit().await.map_err(db_error)?;
    Ok(Json(number))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let pool = PgPool::connect(&dotenvy::var("DATABASE_URL")?).await?;
    sqlx::migrate!().run(&pool).await?;
    let app = Router::new()
        .merge(auth::routes())
        .route("/api/workspaces/{workspace}/issues", get(issues))
        .route("/api/workspaces/{workspace}/issues/{id}", put(save))
        .layer(DefaultBodyLimit::max(8 * 1024 * 1024))
        .with_state(pool);
    let address = dotenvy::var("BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:3000".into());
    let listener = tokio::net::TcpListener::bind(address).await?;
    println!("Sync Line listening on http://{}", listener.local_addr()?);
    axum::serve(listener, app).await?;
    Ok(())
}
