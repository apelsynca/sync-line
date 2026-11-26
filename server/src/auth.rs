use crate::{ApiError, db_error, mail::MailTransport};
use axum::{
    Extension, Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::post,
};
use rand::{Rng, rngs::OsRng};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

const UNAUTHORIZED: ApiError = (StatusCode::UNAUTHORIZED, "Sign in to your workspace.");
const INVALID_CODE: ApiError = (StatusCode::UNAUTHORIZED, "Invalid or expired code.");

pub fn routes(mail: MailTransport) -> Router<PgPool> {
    Router::new()
        .route("/api/auth/code", post(request_code).layer(Extension(mail)))
        .route("/api/auth/verify", post(verify))
        .route("/api/auth/sign-out", post(sign_out))
}

#[derive(Deserialize)]
struct EmailInput {
    email: String,
}

#[derive(Deserialize)]
struct Verification {
    email: String,
    code: String,
    expected_workspace: Option<Uuid>,
}

#[derive(Serialize)]
struct Account {
    id: Uuid,
}

fn normalize(email: &str) -> Result<String, ApiError> {
    let email = email.trim().to_ascii_lowercase();
    let valid = email.split_once('@').is_some_and(|(local, domain)| {
        !local.is_empty()
            && local.len() <= 64
            && local
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b".!#$%&'*+-/=?^_`{|}~".contains(&b))
            && !domain.is_empty()
            && domain.split('.').all(|label| {
                !label.is_empty()
                    && label
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b == b'-')
            })
    });
    if !valid || email.len() > 254 {
        return Err((StatusCode::BAD_REQUEST, "Enter a valid email address."));
    }
    Ok(email)
}

async fn issue_code(pool: &PgPool, email: &str, code: &str) -> Result<Uuid, ApiError> {
    let nonce = Uuid::new_v4();
    let result = sqlx::query(
        "INSERT INTO email_codes(email, nonce, digest)
         VALUES ($1, $2, sha256(uuid_send($2) || convert_to($3,'UTF8')))
         ON CONFLICT(email) DO UPDATE SET nonce=excluded.nonce, digest=excluded.digest,
         issued_at=now(), attempts=0 WHERE email_codes.issued_at <= now() - interval '1 minute'",
    )
    .bind(email)
    .bind(nonce)
    .bind(code)
    .execute(pool)
    .await
    .map_err(db_error)?;
    if result.rows_affected() == 0 {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            "Wait a minute before requesting another code.",
        ));
    }
    Ok(nonce)
}

async fn request_code(
    State(pool): State<PgPool>,
    Extension(mail): Extension<MailTransport>,
    Json(input): Json<EmailInput>,
) -> Result<StatusCode, ApiError> {
    let email = normalize(&input.email)?;
    let code = format!("{:08}", OsRng.gen_range(0..100_000_000u32));
    let nonce = issue_code(&pool, &email, &code).await?;
    if let Err(error) = mail.deliver(&email, "Sign-in code", &code).await {
        eprintln!("Could not deliver sign-in code: {error}");
        sqlx::query("DELETE FROM email_codes WHERE email=$1 AND nonce=$2")
            .bind(email)
            .bind(nonce)
            .execute(&pool)
            .await
            .map_err(db_error)?;
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            "Couldn't deliver the code. Try again.",
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn verify(
    State(pool): State<PgPool>,
    headers: HeaderMap,
    Json(input): Json<Verification>,
) -> Result<Response, ApiError> {
    let email = normalize(&input.email)?;
    let mut tx = pool.begin().await.map_err(db_error)?;
    let matches: Option<bool> = sqlx::query_scalar(
        "UPDATE email_codes SET attempts=attempts+1 WHERE email=$1 AND attempts < 5
         AND issued_at > now() - interval '10 minutes'
         RETURNING digest=sha256(uuid_send(nonce) || convert_to($2,'UTF8'))",
    )
    .bind(&email)
    .bind(input.code)
    .fetch_optional(&mut *tx)
    .await
    .map_err(db_error)?;
    if matches != Some(true) {
        tx.commit().await.map_err(db_error)?;
        return Err(INVALID_CODE);
    }
    sqlx::query("DELETE FROM email_codes WHERE email=$1")
        .bind(&email)
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
    let existing = sqlx::query_scalar("SELECT workspace_id FROM accounts WHERE email=$1")
        .bind(&email)
        .fetch_optional(&mut *tx)
        .await
        .map_err(db_error)?;
    if input.expected_workspace.is_some() && input.expected_workspace != existing {
        tx.commit().await.map_err(db_error)?;
        return Err((
            StatusCode::CONFLICT,
            "Use the email address for this workspace.",
        ));
    }
    let id = match existing {
        Some(id) => id,
        None => {
            let id = Uuid::new_v4();
            sqlx::query("INSERT INTO workspaces(id) VALUES ($1)")
                .bind(id)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            sqlx::query("INSERT INTO accounts(workspace_id,email) VALUES ($1,$2)")
                .bind(id)
                .bind(email)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            id
        }
    };
    let demo = cookie_uuid(&headers, "sync_line_demo");
    if let Some(source) = demo {
        crate::demo::import(&mut tx, source, id).await?;
    }
    let token = Uuid::new_v4();
    sqlx::query("INSERT INTO sessions(digest,workspace_id,expires_at) VALUES(sha256(uuid_send($1)), $2, now() + interval '30 days')")
        .bind(token).bind(id).execute(&mut *tx).await.map_err(db_error)?;
    tx.commit().await.map_err(db_error)?;
    let mut response = Json(Account { id }).into_response();
    response.headers_mut().insert(header::SET_COOKIE,
        format!("sync_line_session={token}; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=2592000").parse().unwrap());
    if demo.is_some() {
        response.headers_mut().append(
            header::SET_COOKIE,
            "sync_line_demo=; Path=/api; HttpOnly; SameSite=Lax; Max-Age=0"
                .parse()
                .unwrap(),
        );
    }
    Ok(response)
}

fn cookie_uuid(headers: &HeaderMap, name: &str) -> Option<Uuid> {
    headers
        .get(header::COOKIE)
        .and_then(|v| v.to_str().ok())
        .and_then(|cookies| {
            cookies.split(';').find_map(|cookie| {
                let (key, value) = cookie.trim().split_once('=')?;
                (key == name).then(|| Uuid::parse_str(value).ok()).flatten()
            })
        })
}

#[derive(Deserialize)]
struct SignOut {}

async fn sign_out(
    State(pool): State<PgPool>,
    headers: HeaderMap,
    _: Json<SignOut>,
) -> Result<Response, ApiError> {
    if let Some(token) = cookie_uuid(&headers, "sync_line_session") {
        sqlx::query("DELETE FROM sessions WHERE digest=sha256(uuid_send($1))")
            .bind(token)
            .execute(&pool)
            .await
            .map_err(db_error)?;
    }
    let mut response = StatusCode::NO_CONTENT.into_response();
    response.headers_mut().insert(
        header::SET_COOKIE,
        "sync_line_session=; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=0"
            .parse()
            .unwrap(),
    );
    Ok(response)
}

pub async fn authorize(
    pool: &PgPool,
    headers: &HeaderMap,
    workspace: Uuid,
) -> Result<(), ApiError> {
    let token = cookie_uuid(headers, "sync_line_session").ok_or(UNAUTHORIZED)?;
    let authorized: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM sessions WHERE digest=sha256(uuid_send($1)) AND workspace_id=$2 AND expires_at > now())")
        .bind(token).bind(workspace).fetch_one(pool).await.map_err(db_error)?;
    if authorized {
        Ok(())
    } else {
        Err(UNAUTHORIZED)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Fields, save};
    use axum::{body::to_bytes, extract::Path};
    use serde_json::Value;

    async fn redeem(pool: &PgPool, email: &str, code: &str) -> Result<Response, ApiError> {
        verify(
            State(pool.clone()),
            HeaderMap::new(),
            Json(Verification {
                email: email.into(),
                code: code.into(),
                expected_workspace: None,
            }),
        )
        .await
    }

    async fn sign_in(pool: &PgPool, email: &str) -> (Uuid, HeaderMap) {
        issue_code(pool, email, "03124567").await.unwrap();
        let response = redeem(pool, email, "03124567").await.unwrap();
        let mut headers = HeaderMap::new();
        let cookie = response.headers()[header::SET_COOKIE]
            .to_str()
            .unwrap()
            .split(';')
            .next()
            .unwrap();
        headers.insert(header::COOKIE, cookie.parse().unwrap());
        let body = to_bytes(response.into_body(), 512).await.unwrap();
        let body: Value = serde_json::from_slice(&body).unwrap();
        (
            Uuid::parse_str(body["id"].as_str().unwrap()).unwrap(),
            headers,
        )
    }

    #[sqlx::test]
    async fn codes_expire_and_limit_retries(pool: PgPool) {
        let email = "code@example.test";
        issue_code(&pool, email, "01234567").await.unwrap();
        assert_eq!(
            issue_code(&pool, email, "11111111").await.unwrap_err().0,
            StatusCode::TOO_MANY_REQUESTS
        );
        for _ in 0..5 {
            assert_eq!(
                redeem(&pool, email, "00000000").await.unwrap_err(),
                INVALID_CODE
            );
        }
        assert_eq!(
            redeem(&pool, email, "01234567").await.unwrap_err(),
            INVALID_CODE
        );
        sqlx::query("UPDATE email_codes SET issued_at=now() - interval '11 minutes', attempts=0")
            .execute(&pool)
            .await
            .unwrap();
        assert_eq!(
            redeem(&pool, email, "01234567").await.unwrap_err(),
            INVALID_CODE
        );
    }

    #[sqlx::test]
    async fn resuming_sync_requires_the_open_workspace(pool: PgPool) {
        let (account, _) = sign_in(&pool, "owner@example.test").await;
        let other = "another@example.test";
        issue_code(&pool, other, "01234567").await.unwrap();
        let error = verify(
            State(pool),
            HeaderMap::new(),
            Json(Verification {
                email: other.into(),
                code: "01234567".into(),
                expected_workspace: Some(account),
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(error.0, StatusCode::CONFLICT);
    }

    #[sqlx::test]
    async fn sign_in_claims_demo_work_once_and_keeps_available_numbers(pool: PgPool) {
        let owner = "demo@example.test";
        let (workspace, _) = sign_in(&pool, owner).await;
        let demo = Uuid::new_v4();
        sqlx::query("INSERT INTO workspaces(id) VALUES ($1)")
            .bind(demo)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO pending_demo_imports VALUES ($1)")
            .bind(demo)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO issues(workspace_id, number, request_id, title, description, status, assignee, priority) VALUES
            ($1, 1, gen_random_uuid(), 'Polish the onboarding checklist', 'Give new teammates a clear starting point on their first visit.', 'In progress', 'Mira Chen', 'High'),
            ($1, 2, gen_random_uuid(), 'Add empty states to search', 'Show a helpful message when a search has no matches.', 'Todo', 'Ana Silva', 'Medium'),
            ($1, 5, gen_random_uuid(), 'Created in demo', 'Offline notes', 'Done', 'Mira Chen', 'High'),
            ($1, 6, gen_random_uuid(), 'Keep ENG-6', '', 'Todo', '', 'Low')")
            .bind(demo).execute(&pool).await.unwrap();
        for _ in 1..=5 {
            crate::write_issue(
                &pool,
                workspace,
                Uuid::new_v4(),
                crate::Write::Legacy(issue("Cloud issue").0),
            )
            .await
            .unwrap();
        }

        let verify_cookie = |email: &str, cookie_id| {
            let mut headers = HeaderMap::new();
            headers.insert(
                header::COOKIE,
                format!("sync_line_demo={cookie_id}").parse().unwrap(),
            );
            verify(
                State(pool.clone()),
                headers,
                Json(Verification {
                    email: email.into(),
                    code: "03124567".into(),
                    expected_workspace: None,
                }),
            )
        };
        for (email, cookie_id) in [
            (owner, demo),
            (owner, demo),
            ("other@example.test", demo),
            ("other@example.test", workspace),
        ] {
            issue_code(&pool, email, "03124567").await.unwrap();
            verify_cookie(email, cookie_id).await.unwrap();
        }
        let imported = sqlx::query_as::<_, crate::Issue>(
            "SELECT cloud.request_id AS id, cloud.* FROM issues cloud JOIN issues demo USING (request_id)
             WHERE cloud.workspace_id=$1 AND demo.workspace_id=$2 ORDER BY demo.number")
            .bind(workspace).bind(demo).fetch_all(&pool).await.unwrap();
        let numbers: Vec<_> = imported.iter().map(|issue| issue.number).collect();
        assert_eq!(numbers, [7, 8, 6]);
        assert!(
            imported
                .iter()
                .all(|issue| issue.fields.assignee.is_empty())
        );
        let created = &imported[1].fields;
        assert_eq!(created.title, "Created in demo");
        assert_eq!(created.description, "Offline notes");
        assert_eq!(created.status, "Done");
        assert_eq!(created.priority, "High");
        let other_count: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM issues JOIN accounts USING(workspace_id) WHERE email='other@example.test'")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(other_count, 0);
    }

    #[sqlx::test]
    async fn signing_out_revokes_only_the_current_session(pool: PgPool) {
        let (account, first) = sign_in(&pool, "solo@example.test").await;
        let (_, second) = sign_in(&pool, "solo@example.test").await;
        for _ in 0..2 {
            let response = sign_out(State(pool.clone()), first.clone(), Json(SignOut {}))
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::NO_CONTENT);
            assert!(
                response.headers()[header::SET_COOKIE]
                    .to_str()
                    .unwrap()
                    .contains("Max-Age=0")
            );
        }
        assert_eq!(authorize(&pool, &first, account).await, Err(UNAUTHORIZED));
        authorize(&pool, &second, account).await.unwrap();
    }

    fn issue(title: &str) -> Json<Fields> {
        Json(Fields {
            title: title.into(),
            description: String::new(),
            status: "Todo".into(),
            priority: "Medium".into(),
            assignee: "Me".into(),
            ..Fields::default()
        })
    }

    #[sqlx::test]
    async fn second_device_recovers_issues_and_retries_keep_the_number(pool: PgPool) {
        let email = "solo@example.test";
        let (account, first) = sign_in(&pool, email).await;
        assert_eq!(
            redeem(&pool, email, "03124567").await.unwrap_err(),
            INVALID_CODE
        );
        let (same, second) = sign_in(&pool, email).await;
        assert_eq!(account, same);
        let path = (account, Uuid::new_v4());
        let (create, retry) = tokio::join!(
            save(
                State(pool.clone()),
                Path(path),
                first.clone(),
                issue("First issue")
            ),
            save(
                State(pool.clone()),
                Path(path),
                second.clone(),
                issue("First issue")
            )
        );
        assert_eq!(create.unwrap().0, 1);
        assert_eq!(retry.unwrap().0, 1);
        assert_eq!(
            save(
                State(pool.clone()),
                Path(path),
                second,
                issue("Updated offline")
            )
            .await
            .unwrap()
            .0,
            1
        );
        assert_eq!(
            save(
                State(pool.clone()),
                Path((account, Uuid::new_v4())),
                first,
                issue("Next issue")
            )
            .await
            .unwrap()
            .0,
            2
        );
        let (_, other) = sign_in(&pool, "other@example.test").await;
        assert_eq!(
            save(
                State(pool.clone()),
                Path(path),
                other.clone(),
                issue("Wrong workspace")
            )
            .await
            .unwrap_err(),
            UNAUTHORIZED
        );
        assert_eq!(
            authorize(&pool, &other, account).await.unwrap_err(),
            UNAUTHORIZED
        );
    }
}
