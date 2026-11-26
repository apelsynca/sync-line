use super::*;
use axum::{
    body::{Body, to_bytes},
    http::{Method, Request, StatusCode, header},
    response::Response,
};
use tower::ServiceExt;

pub(super) async fn account(pool: &PgPool) -> (Uuid, String) {
    let id = Uuid::new_v4();
    let session = Uuid::new_v4();
    sqlx::query("INSERT INTO workspaces(id) VALUES ($1)")
        .bind(id)
        .execute(pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO accounts VALUES ($1,$2)")
        .bind(id)
        .bind(format!("{id}@example.test"))
        .execute(pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO sessions VALUES (sha256(uuid_send($1)),$2,now()+interval '1 hour')")
        .bind(session)
        .bind(id)
        .execute(pool)
        .await
        .unwrap();
    (id, format!("sync_line_session={session}"))
}

pub(super) async fn json_body(response: Response) -> Value {
    serde_json::from_slice(&to_bytes(response.into_body(), 1_000_000).await.unwrap()).unwrap()
}

async fn token_request(app: &Router, id: Uuid, cookie: &str, method: Method) -> Response {
    let req = Request::builder()
        .method(method)
        .uri(format!("/api/workspaces/{id}/mcp-token"))
        .header(header::COOKIE, cookie)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from("{}"))
        .unwrap();
    app.clone().oneshot(req).await.unwrap()
}

async fn rpc(app: &Router, token: &str, method: &str, params: Value) -> Response {
    let req = Request::post("/api/mcp")
        .header(header::HOST, "localhost")
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::ACCEPT, "application/json, text/event-stream")
        .header(header::CONTENT_TYPE, "application/json")
        .header("MCP-Protocol-Version", "2025-11-25")
        .body(Body::from(
            json!({"jsonrpc":"2.0","id":1,"method":method,"params":params}).to_string(),
        ))
        .unwrap();
    app.clone().oneshot(req).await.unwrap()
}

async fn call(app: &Router, secret: &str, name: &str, args: Value) -> Value {
    let response = rpc(
        app,
        secret,
        "tools/call",
        json!({"name":name,"arguments":args}),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let result = json_body(response).await;
    assert!(result["error"].is_null(), "{result}");
    result["result"].clone()
}

#[sqlx::test]
async fn tools_share_browser_writes_and_retries_preserve_issue_identity(pool: PgPool) {
    let (id, cookie) = account(&pool).await;
    let app = routes(&pool, &"http://localhost:5173".parse().unwrap())
        .route(
            "/api/workspaces/{workspace}/issues",
            axum::routing::get(crate::issues),
        )
        .with_state(pool);
    let issued = token_request(&app, id, &cookie, Method::POST).await;
    assert_eq!(issued.status(), StatusCode::CREATED);
    let token = json_body(issued).await["token"]
        .as_str()
        .unwrap()
        .to_owned();
    let tools = json_body(rpc(&app, &token, "tools/list", json!({})).await).await;
    let names: std::collections::BTreeSet<_> = tools["result"]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["name"].as_str().unwrap())
        .collect();
    assert_eq!(
        names,
        ["search_issues", "get_issue", "create_issue", "update_issue"].into()
    );

    let issue_id = Uuid::new_v4();
    let args =
        json!({"request_id":issue_id, "title":"First", "description":"Keep this", "labels":"Web"});
    let create = || call(&app, &token, "create_issue", args.clone());
    let (a, b) = tokio::join!(create(), create());
    assert_eq!(a["structuredContent"], b["structuredContent"]);
    let issue = &a["structuredContent"];
    assert_eq!(issue["id"], issue_id.to_string());
    assert_eq!(
        issue["url"],
        format!("http://localhost:5173/app/issues/{issue_id}")
    );
    assert_eq!(issue["number"], 1);
    let matches = call(&app, &token, "search_issues", json!({"query":"wEb"})).await;
    assert_eq!(matches["structuredContent"]["issues"][0]["id"], issue["id"]);

    let invalid = call(
        &app,
        &token,
        "update_issue",
        json!({"id":issue_id,"description":"discard","status":"unknown"}),
    )
    .await;
    assert_eq!(invalid["isError"], true);
    let updated = call(
        &app,
        &token,
        "update_issue",
        json!({"id":issue_id,"status":"Done"}),
    )
    .await;
    assert_eq!(updated["structuredContent"]["status"], "Done");
    assert_eq!(updated["structuredContent"]["description"], "Keep this");
    let req = Request::get(format!("/api/workspaces/{id}/issues"))
        .header(header::COOKIE, cookie)
        .body(Body::empty())
        .unwrap();
    let synced = json_body(app.oneshot(req).await.unwrap()).await;
    assert_eq!(synced.as_array().unwrap().len(), 1);
    assert_eq!(synced[0]["versions"]["status"][0]["value"], "Done");
    assert_eq!(synced[0]["labels"], "Web");
}

#[sqlx::test]
async fn workspace_tokens_isolate_accounts_and_revoke_immediately(pool: PgPool) {
    let (a, owner) = account(&pool).await;
    let (b, other) = account(&pool).await;
    let app = routes(&pool, &"https://example.test".parse().unwrap()).with_state(pool);
    for method in [Method::GET, Method::POST, Method::DELETE] {
        assert_eq!(
            token_request(&app, a, &other, method).await.status(),
            StatusCode::UNAUTHORIZED
        );
    }
    let first = json_body(token_request(&app, a, &owner, Method::POST).await).await;
    let token = first["token"].as_str().unwrap();
    assert_eq!(
        token_request(&app, a, &owner, Method::POST).await.status(),
        StatusCode::CONFLICT
    );
    let second = json_body(token_request(&app, b, &other, Method::POST).await).await;
    let other_token = second["token"].as_str().unwrap();

    let private = call(&app, token, "create_issue", json!({"title":"Private"})).await;
    let id = &private["structuredContent"]["id"];
    assert!(id.is_string());
    let search = call(&app, other_token, "search_issues", json!({})).await;
    assert_eq!(search["structuredContent"]["issues"], json!([]));
    for (name, args) in [
        ("get_issue", json!({"id":id})),
        ("update_issue", json!({"id":id,"title":"Changed"})),
    ] {
        assert_eq!(call(&app, other_token, name, args).await["isError"], true);
    }
    assert_eq!(
        call(&app, token, "get_issue", json!({"id":id})).await["structuredContent"]["title"],
        "Private"
    );
    assert_eq!(
        token_request(&app, a, &owner, Method::DELETE)
            .await
            .status(),
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        rpc(&app, token, "tools/list", json!({})).await.status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        rpc(&app, other_token, "tools/list", json!({}))
            .await
            .status(),
        StatusCode::OK
    );
}
