use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{post, put},
};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

type ApiError = (StatusCode, &'static str);
const SESSION: &str = "sync_line_demo";

#[derive(Deserialize, Serialize, sqlx::FromRow)]
struct Fields {
    title: String,
    description: String,
    status: String,
    assignee: String,
    priority: String,
}

impl Fields {
    fn validate(&mut self) -> Result<(), ApiError> {
        self.title = self.title.trim().to_owned();
        if self.title.is_empty()
            || self.title.chars().count() > 200
            || !["Todo", "In progress", "Done"].contains(&self.status.as_str())
            || !["", "Mira Chen", "Theo Park", "Ana Silva"].contains(&self.assignee.as_str())
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
    number: i32,
    #[serde(flatten)]
    #[sqlx(flatten)]
    fields: Fields,
}

#[derive(Deserialize)]
struct NewIssue {
    request_id: Uuid,
    #[serde(flatten)]
    fields: Fields,
}

fn db_error(error: sqlx::Error) -> ApiError {
    eprintln!("Database error: {error}");
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        "Database unavailable. Please retry.",
    )
}

fn session(headers: &HeaderMap) -> Result<Uuid, ApiError> {
    headers
        .get(header::COOKIE)
        .and_then(|value| value.to_str().ok())
        .and_then(|cookies| {
            cookies.split(';').find_map(|cookie| {
                let (name, value) = cookie.trim().split_once('=')?;
                (name == SESSION)
                    .then(|| Uuid::parse_str(value).ok())
                    .flatten()
            })
        })
        .ok_or((
            StatusCode::UNAUTHORIZED,
            "Open the demo to start a workspace.",
        ))
}

async fn insert(
    tx: &mut Transaction<'_, Postgres>,
    workspace: Uuid,
    request: Uuid,
    fields: Fields,
) -> Result<i32, ApiError> {
    let number: i32 =
        sqlx::query_scalar("SELECT next_number FROM workspaces WHERE id = $1 FOR UPDATE")
            .bind(workspace)
            .fetch_optional(&mut **tx)
            .await
            .map_err(db_error)?
            .ok_or((StatusCode::UNAUTHORIZED, "Workspace expired."))?;
    // The workspace row lock serializes numbering and retries of the same create.
    if let Some(existing) =
        sqlx::query_scalar("SELECT number FROM issues WHERE workspace_id=$1 AND request_id=$2")
            .bind(workspace)
            .bind(request)
            .fetch_optional(&mut **tx)
            .await
            .map_err(db_error)?
    {
        return Ok(existing);
    }
    sqlx::query("UPDATE workspaces SET next_number = next_number + 1 WHERE id = $1")
        .bind(workspace)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    sqlx::query("INSERT INTO issues (workspace_id,number,request_id,title,description,status,assignee,priority) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)")
        .bind(workspace).bind(number).bind(request).bind(fields.title).bind(fields.description)
        .bind(fields.status).bind(fields.assignee).bind(fields.priority).execute(&mut **tx).await.map_err(db_error)?;
    Ok(number)
}

async fn workspace(State(pool): State<PgPool>, headers: HeaderMap) -> Result<Response, ApiError> {
    let mut tx = pool.begin().await.map_err(db_error)?;
    let mut current = None;
    if let Ok(id) = session(&headers) {
        current = sqlx::query_scalar::<_, Uuid>("SELECT id FROM workspaces WHERE id=$1")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(db_error)?;
    }
    let id = current.unwrap_or_else(Uuid::new_v4);
    if current.is_none() {
        sqlx::query("INSERT INTO workspaces(id) VALUES ($1)")
            .bind(id)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        let seeds: Vec<Fields> = serde_json::from_str(include_str!("../../web/shared/issues.json"))
            .expect("valid demo seed");
        for seed in seeds {
            insert(&mut tx, id, Uuid::new_v4(), seed).await?;
        }
    }
    let issues =
        sqlx::query_as::<_, Issue>("SELECT * FROM issues WHERE workspace_id=$1 ORDER BY number")
            .bind(id)
            .fetch_all(&mut *tx)
            .await
            .map_err(db_error)?;
    tx.commit().await.map_err(db_error)?;
    let mut response = Json(issues).into_response();
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    if current.is_none() {
        response.headers_mut().insert(
            header::SET_COOKIE,
            format!("{SESSION}={id}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=2592000")
                .parse()
                .unwrap(),
        );
    }
    Ok(response)
}

async fn create(
    State(pool): State<PgPool>,
    headers: HeaderMap,
    Json(mut input): Json<NewIssue>,
) -> Result<Json<i32>, ApiError> {
    let id = session(&headers)?;
    input.fields.validate()?;
    let mut tx = pool.begin().await.map_err(db_error)?;
    let number = insert(&mut tx, id, input.request_id, input.fields).await?;
    tx.commit().await.map_err(db_error)?;
    Ok(Json(number))
}

async fn update(
    State(pool): State<PgPool>,
    Path(number): Path<i32>,
    headers: HeaderMap,
    Json(mut fields): Json<Fields>,
) -> Result<StatusCode, ApiError> {
    let id = session(&headers)?;
    fields.validate()?;
    let result = sqlx::query("UPDATE issues SET title=$3,description=$4,status=$5,assignee=$6,priority=$7 WHERE workspace_id=$1 AND number=$2")
        .bind(id).bind(number).bind(fields.title).bind(fields.description).bind(fields.status).bind(fields.assignee).bind(fields.priority)
        .execute(&pool).await.map_err(db_error)?;
    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Issue not found."));
    }
    Ok(StatusCode::NO_CONTENT)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let pool = PgPool::connect(&dotenvy::var("DATABASE_URL")?).await?;
    sqlx::migrate!().run(&pool).await?;
    let app = Router::new()
        .route("/api/workspace", post(workspace))
        .route("/api/issues", post(create))
        .route("/api/issues/{number}", put(update))
        .with_state(pool);
    let address = dotenvy::var("BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:3000".into());
    let listener = tokio::net::TcpListener::bind(address).await?;
    println!("Sync Line listening on http://{}", listener.local_addr()?);
    axum::serve(listener, app).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn open(pool: &PgPool) -> HeaderMap {
        let response = workspace(State(pool.clone()), HeaderMap::new())
            .await
            .unwrap();
        let cookie = response.headers()[header::SET_COOKIE]
            .to_str()
            .unwrap()
            .split(';')
            .next()
            .unwrap();
        let mut headers = HeaderMap::new();
        headers.insert(header::COOKIE, cookie.parse().unwrap());
        headers
    }

    fn draft(request_id: Uuid) -> Json<NewIssue> {
        Json(NewIssue {
            request_id,
            fields: Fields {
                title: "Retry this issue".into(),
                description: String::new(),
                status: "Todo".into(),
                assignee: "Mira Chen".into(),
                priority: "Low".into(),
            },
        })
    }

    #[sqlx::test]
    async fn concurrent_create_retries_stay_in_one_workspace(pool: PgPool) {
        let owner = open(&pool).await;
        let other = open(&pool).await;
        let request = Uuid::new_v4();
        let (first, retry) = tokio::join!(
            create(State(pool.clone()), owner.clone(), draft(request)),
            create(State(pool.clone()), owner.clone(), draft(request))
        );
        let number = first.unwrap().0;
        assert_eq!(retry.unwrap().0, number);
        let next = create(State(pool.clone()), owner, draft(Uuid::new_v4()))
            .await
            .unwrap()
            .0;
        assert_eq!(next, number + 1);
        let error = update(
            State(pool),
            Path(number),
            other,
            Json(draft(request).0.fields),
        )
        .await
        .unwrap_err();
        assert_eq!(error.0, StatusCode::NOT_FOUND);
    }
}
