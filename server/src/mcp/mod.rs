pub(crate) mod agent;
mod tokens;

use std::{collections::BTreeMap, sync::Arc};

use axum::{
    Router,
    extract::Request,
    http::{StatusCode, header},
    response::IntoResponse,
    routing::any,
};
use rmcp::{
    handler::server::wrapper::Parameters,
    model::CallToolResult,
    tool, tool_router,
    transport::streamable_http_server::{
        StreamableHttpServerConfig, StreamableHttpService, session::never::NeverSessionManager,
    },
};
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{Field, Issue, Write, db_error, write_issue};

pub fn routes(pool: &PgPool, url: &url::Url) -> Router<PgPool> {
    let host = url.host_str().expect("validated APP_ORIGIN has a host");
    let origin = url.origin().ascii_serialization();
    let config = StreamableHttpServerConfig::default()
        .with_legacy_session_mode(false)
        .with_json_response(true)
        .with_allowed_hosts([host, "127.0.0.1", "localhost", "::1"])
        .with_allowed_origins([format!(
            "{}://{}:{}",
            url.scheme(),
            host,
            url.port_or_known_default().unwrap()
        )]);
    let pool = pool.clone();
    tokens::routes().route(
        "/api/mcp",
        any(move |request: Request| {
            let pool = pool.clone();
            let origin = origin.clone();
            let config = config.clone();
            async move {
                let workspace = match tokens::workspace(&pool, request.headers()).await {
                    Ok(Some(workspace)) => workspace,
                    Ok(None) => {
                        return (
                            StatusCode::UNAUTHORIZED,
                            [(header::WWW_AUTHENTICATE, "Bearer realm=\"Sync Line MCP\"")],
                            "Supply a workspace MCP token.",
                        )
                            .into_response();
                    }
                    Err(error) => return error.into_response(),
                };
                let service = StreamableHttpService::new(
                    move || {
                        Ok(IssueTools {
                            pool: pool.clone(),
                            workspace,
                            origin: origin.clone(),
                        })
                    },
                    Arc::new(NeverSessionManager::default()),
                    config,
                );
                service.handle(request).await.into_response()
            }
        }),
    )
}

#[derive(Clone)]
struct IssueTools {
    pool: PgPool,
    workspace: Uuid,
    origin: String,
}

#[derive(Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct Search {
    /// Case-insensitive text in ENG number, title, description, or labels. Omit to list all issues.
    #[serde(default)]
    query: String,
    /// Limit results to these statuses (Backlog, Todo, In progress, Done).
    #[serde(default)]
    statuses: Vec<String>,
    /// Me, or an empty string for Unassigned. Omit for all assignees.
    assignee: Option<String>,
    /// Continue after the last issue number returned in next_after.
    #[serde(default)]
    after: u32,
}

#[derive(Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct IssueId {
    /// Permanent issue UUID returned by search_issues or create_issue.
    id: Uuid,
}

#[derive(Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct Create {
    /// Non-empty issue title, up to 200 characters.
    title: String,
    /// Optional new UUID. Reuse it when retrying the same creation to keep one issue.
    request_id: Option<Uuid>,
    #[serde(flatten)]
    properties: Properties,
}

#[derive(Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct Update {
    id: Uuid,
    title: Option<String>,
    #[serde(flatten)]
    properties: Properties,
}

#[derive(Deserialize, JsonSchema)]
struct Properties {
    description: Option<String>,
    /// Backlog, Todo, In progress, or Done. New issues default to Todo.
    status: Option<String>,
    /// No priority, Low, Medium, or High.
    priority: Option<String>,
    /// Me, or an empty string for Unassigned.
    assignee: Option<String>,
    /// Comma-separated labels. An empty string clears them.
    labels: Option<String>,
}

impl Properties {
    fn fields(self, title: Option<String>) -> BTreeMap<Field, String> {
        [
            (Field::Title, title),
            (Field::Description, self.description),
            (Field::Status, self.status),
            (Field::Priority, self.priority),
            (Field::Assignee, self.assignee),
            (Field::Labels, self.labels),
        ]
        .into_iter()
        .filter_map(|(key, value)| Some((key, value?)))
        .collect()
    }
}

#[rmcp::tool_handler(name = "Sync Line")]
impl rmcp::ServerHandler for IssueTools {}

#[tool_router]
impl IssueTools {
    fn issue(&self, issue: Issue) -> CallToolResult {
        CallToolResult::structured(json!({
            "id": issue.id,
            "number": issue.number,
            "url": format!("{}/app/issues/{}", self.origin, issue.id),
            "title": issue.fields.title,
            "description": issue.fields.description,
            "status": issue.fields.status,
            "priority": issue.fields.priority,
            "assignee": issue.fields.assignee,
            "labels": issue.fields.labels,
        }))
    }

    #[tool(annotations(read_only_hint = true))]
    /// Search workspace issues in issue-number order, up to 50 at a time.
    async fn search_issues(
        &self,
        Parameters(input): Parameters<Search>,
    ) -> Result<CallToolResult, String> {
        if input.query.contains('\0') {
            return Err("Query contains an invalid character.".into());
        }
        let rows: Vec<(Uuid, i32, String, String)> = sqlx::query_as(
            "SELECT request_id, number, title, status FROM issues WHERE workspace_id=$1 AND NOT deleted AND number > $2::bigint
             AND (strpos(lower('ENG-' || number), lower($3)) > 0 OR strpos(lower(title), lower($3)) > 0
             OR strpos(lower(description), lower($3)) > 0 OR strpos(lower(labels), lower($3)) > 0)
             AND (cardinality($4::text[]) = 0 OR status = ANY($4)) AND ($5::text IS NULL OR assignee = $5)
             ORDER BY number LIMIT 51",
        )
        .bind(self.workspace)
        .bind(i64::from(input.after))
        .bind(input.query.trim())
        .bind(input.statuses)
        .bind(input.assignee)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| db_error(e).1)?;
        let next_after = (rows.len() > 50).then(|| rows[49].1);
        let issues: Vec<Value> = rows
            .into_iter()
            .take(50)
            .map(|(id, number, title, status)| {
                json!({
                    "id": id,
                    "number": number,
                    "title": title,
                    "status": status,
                    "url": format!("{}/app/issues/{id}", self.origin),
                })
            })
            .collect();
        Ok(CallToolResult::structured(
            json!({ "issues": issues, "next_after": next_after }),
        ))
    }

    #[tool(annotations(read_only_hint = true))]
    /// Get the current fields and permanent browser link for one issue.
    async fn get_issue(
        &self,
        Parameters(input): Parameters<IssueId>,
    ) -> Result<CallToolResult, String> {
        let issue = sqlx::query_as::<_, Issue>(
            "SELECT request_id AS id, * FROM issues WHERE workspace_id=$1 AND request_id=$2 AND NOT deleted",
        )
        .bind(self.workspace)
        .bind(input.id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| db_error(e).1)?
        .ok_or("Issue not found.")?;
        Ok(self.issue(issue))
    }

    #[tool]
    /// Create an issue in the authorized workspace.
    async fn create_issue(
        &self,
        Parameters(input): Parameters<Create>,
    ) -> Result<CallToolResult, String> {
        let mut fields = input.properties.fields(Some(input.title));
        for (key, default) in [
            (Field::Status, "Todo"),
            (Field::Priority, "No priority"),
            (Field::Assignee, ""),
            (Field::Description, ""),
            (Field::Labels, ""),
        ] {
            fields.entry(key).or_insert_with(|| default.to_owned());
        }
        let id = input.request_id.unwrap_or_else(Uuid::new_v4);
        let issue = write_issue(&self.pool, self.workspace, id, Write::Create(fields))
            .await
            .map_err(|e| e.1)?;
        Ok(self.issue(issue))
    }

    #[tool]
    /// Update only the supplied fields of an existing issue.
    async fn update_issue(
        &self,
        Parameters(input): Parameters<Update>,
    ) -> Result<CallToolResult, String> {
        let fields = input.properties.fields(input.title);
        if fields.is_empty() {
            return Err("Supply at least one field to update.".into());
        }
        let issue = write_issue(&self.pool, self.workspace, input.id, Write::Update(fields))
            .await
            .map_err(|e| e.1)?;
        Ok(self.issue(issue))
    }

    #[tool(annotations(destructive_hint = true, idempotent_hint = true))]
    /// Permanently delete one issue by UUID when the user asks to delete it.
    async fn delete_issue(
        &self,
        Parameters(input): Parameters<IssueId>,
    ) -> Result<CallToolResult, String> {
        let number = write_issue(
            &self.pool,
            self.workspace,
            input.id,
            Write::Delete {
                require_existing: true,
            },
        )
        .await
        .map_err(|e| e.1)?
        .number;
        Ok(CallToolResult::structured(
            json!({"id": input.id, "number": number, "deleted": true}),
        ))
    }
}

#[cfg(test)]
mod tests;
