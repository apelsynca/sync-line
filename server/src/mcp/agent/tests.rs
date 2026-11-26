use super::*;
use crate::mcp::tests::{account, json_body};
use axum::{
    body::Body,
    http::{Request, header},
    response::Response,
};
use tower::ServiceExt;

async fn send(app: &Router, account: Uuid, cookie: &str, body: &Value) -> Response {
    app.clone()
        .oneshot(
            Request::post(format!("/api/workspaces/{account}/agent"))
                .header(header::COOKIE, cookie)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap()
}

#[sqlx::test]
async fn chat_uses_scoped_tools_and_returns_permanent_issue_references(pool: PgPool) {
    let (owner, cookie) = account(&pool).await;
    let (other, other_cookie) = account(&pool).await;
    let seed = |workspace| IssueTools {
        pool: pool.clone(),
        workspace,
        origin: "http://localhost".into(),
    };
    let create = |title: &str| {
        Parameters(serde_json::from_value(json!({"title":title,"status":"Backlog"})).unwrap())
    };
    let private = seed(other)
        .create_issue(create("Private issue"))
        .await
        .unwrap()
        .structured_content
        .unwrap();
    let attached = seed(owner)
        .create_issue(create("Deferred task"))
        .await
        .unwrap()
        .structured_content
        .unwrap();
    let hidden = private["id"].clone();

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base_url = format!("http://{}/v1/", listener.local_addr().unwrap());
    let mock = Router::new().route(
        "/v1/chat/completions",
        post(move |headers: HeaderMap, Json(body): Json<Value>| {
            let hidden = hidden.clone();
            async move {
                assert_eq!(headers[header::AUTHORIZATION], "Bearer sample-key");
                assert_eq!(body["model"], "test-model");
                assert_eq!(body["tools"].as_array().unwrap().len(), 4);
                let messages = body["messages"].as_array().unwrap();
                let last = messages.last().unwrap();
                let tool = |id: &str, name: &str, args: Value| {
                    json!({"id":id,"type":"function","function":{
                        "name":name, "arguments":args.to_string()
                    }})
                };
                let reply = if last["tool_call_id"] == "attached_issue" {
                    assert!(last["content"].as_str().unwrap().contains("Deferred task"));
                    json!({"tool_calls":[
                        tool("backlog","search_issues",json!({"statuses":["Backlog"]})),
                        tool("private","update_issue",json!({"id":hidden,"title":"Changed"})),
                        tool("new","create_issue",json!({"title":"Follow up"}))
                    ]})
                } else {
                    let results: Vec<Value> = messages
                        .iter()
                        .rev()
                        .take(3)
                        .map(|m| serde_json::from_str(m["content"].as_str().unwrap()).unwrap())
                        .collect();
                    assert_eq!(results[0]["title"], "Follow up");
                    assert_eq!(results[1]["error"], "Issue not found.");
                    assert_eq!(results[2]["issues"].as_array().unwrap().len(), 1);
                    json!({"content":"Created ENG-2 to follow up on ENG-1."})
                };
                Json(json!({"choices":[{"message":reply}]}))
            }
        }),
    );
    let task = tokio::spawn(async move { axum::serve(listener, mock).await.unwrap() });
    let config = AgentConfig {
        base_url,
        model: Some("test-model".into()),
        api_key: Some("sample-key".into()),
    };
    let app = routes(&"http://localhost".parse().unwrap(), config)
        .unwrap()
        .with_state(pool);
    let mut body =
        json!({"request_id":Uuid::new_v4(),"prompt":"Follow up on this","issue_id":attached["id"]});
    assert_eq!(
        send(&app, owner, &other_cookie, &body).await.status(),
        StatusCode::UNAUTHORIZED
    );
    for _ in 0..2 {
        let response = send(&app, owner, &cookie, &body).await;
        assert_eq!(response.status(), StatusCode::OK);
        let reply = json_body(response).await;
        assert_eq!(reply["issues"].as_array().unwrap().len(), 2);
        assert_eq!(reply["issues"][0]["id"], attached["id"]);
        assert_eq!(reply["issues"][1]["number"], 2);
        assert_eq!(reply["content"], "Created ENG-2 to follow up on ENG-1.");
    }
    body["issue_id"] = private["id"].clone();
    assert_eq!(
        send(&app, owner, &cookie, &body).await.status(),
        StatusCode::NOT_FOUND
    );
    task.abort();
}
