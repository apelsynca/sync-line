use crate::{ApiError, Fields, Issue, Write, db_error, lock_workspace, write_issue_in};
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

pub async fn import(
    tx: &mut Transaction<'_, Postgres>,
    source: Uuid,
    destination: Uuid,
) -> Result<(), ApiError> {
    let claim = sqlx::query("DELETE FROM pending_demo_imports WHERE workspace_id=$1")
        .bind(source)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    if claim.rows_affected() == 0 {
        return Ok(());
    }

    // Reserve available original numbers before a collision can use one as its fallback.
    lock_workspace(tx, destination).await?;
    let issues = sqlx::query_as::<_, Issue>(
        "SELECT demo.request_id AS id, demo.* FROM issues demo
         WHERE demo.workspace_id=$1
         ORDER BY EXISTS (SELECT 1 FROM issues cloud
             WHERE cloud.workspace_id=$2 AND cloud.number=demo.number), demo.number",
    )
    .bind(source)
    .bind(destination)
    .fetch_all(&mut **tx)
    .await
    .map_err(db_error)?;
    let samples: Vec<Fields> = serde_json::from_str(include_str!("../../web/shared/demo-v1.json"))
        .expect("valid original demo samples");
    for Issue {
        id,
        number,
        mut fields,
        ..
    } in issues
    {
        if samples.get((number - 1) as usize) == Some(&fields) {
            continue;
        }
        fields.assignee.clear();
        write_issue_in(tx, destination, id, Write::Import { number, fields }).await?;
    }
    Ok(())
}
