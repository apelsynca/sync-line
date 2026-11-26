mod auth;
mod demo;
mod mail;
mod merge;

use merge::{Changes, FIELDS, Versions};

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Path, State},
    http::{HeaderMap, StatusCode, header},
    routing::{get, put},
};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Postgres, Transaction, types::Json as DbJson};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

type ApiError = (StatusCode, &'static str);

#[derive(Default, Deserialize, PartialEq, Serialize, sqlx::FromRow)]
struct Fields {
    title: String,
    description: String,
    status: String,
    assignee: String,
    priority: String,
}

#[derive(Serialize, sqlx::FromRow)]
struct Issue {
    id: Uuid,
    number: i32,
    #[serde(flatten)]
    #[sqlx(flatten)]
    fields: Fields,
    #[sqlx(json)]
    versions: Versions,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
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
    let mut headers = HeaderMap::new();
    headers.insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    headers.insert("x-sync-line-time", now_ms().into());
    Ok((headers, Json(issues)))
}

#[derive(Deserialize)]
struct Patch {
    number: i32,
    changes: Changes,
}

enum Write {
    Patch(Patch),
    Legacy(Fields),
    Import { number: i32, fields: Fields },
}

async fn write_issue(
    pool: &PgPool,
    workspace: Uuid,
    id: Uuid,
    write: Write,
) -> Result<Issue, ApiError> {
    let mut tx = pool.begin().await.map_err(db_error)?;
    let issue = write_issue_in(&mut tx, workspace, id, write).await?;
    tx.commit().await.map_err(db_error)?;
    Ok(issue)
}

async fn lock_workspace(
    tx: &mut Transaction<'_, Postgres>,
    workspace: Uuid,
) -> Result<i32, ApiError> {
    // Serialize ID retries and number assignment against the committed workspace state.
    sqlx::query_scalar("SELECT next_number FROM workspaces WHERE id=$1 FOR UPDATE")
        .bind(workspace)
        .fetch_one(&mut **tx)
        .await
        .map_err(db_error)
}

async fn write_issue_in(
    tx: &mut Transaction<'_, Postgres>,
    workspace: Uuid,
    id: Uuid,
    write: Write,
) -> Result<Issue, ApiError> {
    let next = lock_workspace(tx, workspace).await?;
    let current = sqlx::query_as::<_, Issue>(
        "SELECT request_id AS id, * FROM issues WHERE workspace_id=$1 AND request_id=$2",
    )
    .bind(workspace)
    .bind(id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_error)?;
    if matches!(write, Write::Import { .. })
        && let Some(existing) = current
    {
        return Ok(existing);
    }
    let preferred = match &write {
        Write::Patch(patch) => patch.number,
        Write::Import { number, .. } => *number,
        Write::Legacy(_) => next,
    };
    let creating = current.is_none();
    let mut issue = current.unwrap_or_else(|| Issue {
        id,
        number: next,
        fields: Fields::default(),
        versions: Versions::new(),
    });
    if creating && preferred != next {
        let taken: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM issues WHERE workspace_id=$1 AND number=$2)",
        )
        .bind(workspace)
        .bind(preferred)
        .fetch_one(&mut **tx)
        .await
        .map_err(db_error)?;
        if !taken {
            issue.number = preferred;
        }
    }
    let changes = match write {
        Write::Patch(patch) => {
            if patch.number <= 0
                || patch.changes.is_empty()
                || (creating && patch.changes.len() != FIELDS.len())
            {
                return Err((StatusCode::BAD_REQUEST, "Missing issue fields or number."));
            }
            patch.changes
        }
        Write::Legacy(mut fields) | Write::Import { mut fields, .. } => {
            let mut changes = Changes::new();
            for key in FIELDS {
                let value = fields.value_mut(key);
                if creating || issue.fields.value_mut(key) != value {
                    let parents = issue
                        .versions
                        .get(&key)
                        .map(Vec::as_slice)
                        .unwrap_or_default();
                    changes.insert(
                        key,
                        merge::legacy_change(std::mem::take(value), parents, now_ms()),
                    );
                }
            }
            changes
        }
    };
    for (key, change) in changes {
        change.validate(key)?;
        let heads = issue.versions.entry(key).or_default();
        merge::merge(heads, change);
        issue.fields.value_mut(key).clone_from(&heads[0].value);
    }
    let f = &issue.fields;
    sqlx::query("INSERT INTO issues(workspace_id, request_id, number, title, description, status, priority, assignee, versions)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(workspace_id,request_id) DO UPDATE SET
        title=excluded.title, description=excluded.description, status=excluded.status,
        priority=excluded.priority, assignee=excluded.assignee, versions=excluded.versions")
        .bind(workspace).bind(id).bind(issue.number).bind(&f.title).bind(&f.description).bind(&f.status)
        .bind(&f.priority).bind(&f.assignee).bind(DbJson(&issue.versions)).execute(&mut **tx).await.map_err(db_error)?;
    if creating && issue.number == next {
        sqlx::query("UPDATE workspaces SET next_number=(
            SELECT min(i.number::bigint+1) FROM issues i WHERE i.workspace_id=$1 AND i.number >= $2
            AND NOT EXISTS (SELECT 1 FROM issues used WHERE used.workspace_id=$1 AND used.number=i.number::bigint+1)
        ) WHERE id=$1").bind(workspace).bind(next).execute(&mut **tx).await.map_err(db_error)?;
    }
    Ok(issue)
}

async fn patch(
    State(pool): State<PgPool>,
    Path((workspace, id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Json(patch): Json<Patch>,
) -> Result<Json<Issue>, ApiError> {
    auth::authorize(&pool, &headers, workspace).await?;
    Ok(Json(
        write_issue(&pool, workspace, id, Write::Patch(patch)).await?,
    ))
}

// Previously installed clients still send whole issues and expect a display number.
async fn save(
    State(pool): State<PgPool>,
    Path((workspace, id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Json(fields): Json<Fields>,
) -> Result<Json<i32>, ApiError> {
    auth::authorize(&pool, &headers, workspace).await?;
    Ok(Json(
        write_issue(&pool, workspace, id, Write::Legacy(fields))
            .await?
            .number,
    ))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mail = mail::MailTransport::configured()?;
    let pool = PgPool::connect(&dotenvy::var("DATABASE_URL")?).await?;
    sqlx::migrate!().run(&pool).await?;
    let app = Router::new()
        .merge(auth::routes(mail))
        .route("/api/workspaces/{workspace}/issues", get(issues))
        .route(
            "/api/workspaces/{workspace}/issues/{id}",
            put(save).patch(patch),
        )
        .layer(DefaultBodyLimit::max(8 * 1024 * 1024))
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
    use merge::{Field, Version};

    fn edit(value: &str, writer: Uuid) -> Version {
        Version {
            value: value.into(),
            time: 1000,
            writer,
            clock: [(writer, 1)].into(),
        }
    }

    #[sqlx::test]
    async fn collisions_preserve_bookmarks_and_partial_edits_preserve_legacy_fields(pool: PgPool) {
        let workspace = Uuid::new_v4();
        let original = Uuid::new_v4();
        sqlx::query("INSERT INTO workspaces VALUES ($1,2)")
            .bind(workspace)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO issues(workspace_id,number,request_id,title,description,status,assignee,priority)
            VALUES ($1,1,$2,'Original','Keep description','Todo','Me','Low')").bind(workspace).bind(original).execute(&pool).await.unwrap();
        let a = Uuid::new_v4();
        let b = Uuid::new_v4();
        let patch = |changes| Write::Patch(Patch { number: 1, changes });
        let (title, status) = tokio::join!(
            write_issue(
                &pool,
                workspace,
                original,
                patch([(Field::Title, edit("Renamed", a))].into())
            ),
            write_issue(
                &pool,
                workspace,
                original,
                patch([(Field::Status, edit("Done", b))].into())
            )
        );
        title.unwrap();
        status.unwrap();
        let distinct = Uuid::new_v4();
        let create = || {
            patch(
                [
                    (Field::Title, edit("New", b)),
                    (Field::Description, edit("", b)),
                    (Field::Status, edit("Todo", b)),
                    (Field::Priority, edit("No priority", b)),
                    (Field::Assignee, edit("", b)),
                ]
                .into(),
            )
        };
        for _ in 0..2 {
            assert_eq!(
                write_issue(&pool, workspace, distinct, create())
                    .await
                    .unwrap()
                    .number,
                2
            );
        }
        let first = sqlx::query_as::<_, Issue>(
            "SELECT request_id AS id,* FROM issues WHERE workspace_id=$1 AND number=1",
        )
        .bind(workspace)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(first.id, original);
        assert_eq!(first.fields.title, "Renamed");
        assert_eq!(first.fields.status, "Done");
        assert_eq!(first.fields.description, "Keep description");
        assert_eq!(first.fields.assignee, "Me");
    }
}
