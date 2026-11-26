use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use uuid::Uuid;

use crate::{ApiError, Fields};
use axum::http::StatusCode;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum Field {
    Title,
    Description,
    Status,
    Assignee,
    Priority,
    Labels,
}

// Older offline clients create and replace issues using these five fields.
pub const ORIGINAL_FIELDS: [Field; 5] = [
    Field::Title,
    Field::Description,
    Field::Status,
    Field::Assignee,
    Field::Priority,
];

impl Fields {
    pub fn value_mut(&mut self, key: Field) -> &mut String {
        match key {
            Field::Title => &mut self.title,
            Field::Description => &mut self.description,
            Field::Status => &mut self.status,
            Field::Assignee => &mut self.assignee,
            Field::Priority => &mut self.priority,
            Field::Labels => &mut self.labels,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Version {
    pub value: String,
    pub time: i64,
    pub writer: Uuid,
    pub clock: BTreeMap<Uuid, u64>,
}

pub type Versions = BTreeMap<Field, Vec<Version>>;
pub type Changes = BTreeMap<Field, Version>;

impl Version {
    pub fn validate(&self, field: Field) -> Result<(), ApiError> {
        let value = self.value.as_str();
        let valid = match field {
            Field::Title => !value.trim().is_empty() && value.chars().count() <= 200,
            Field::Description => true,
            Field::Status => ["Backlog", "Todo", "In progress", "Done"].contains(&value),
            Field::Assignee => ["", "Me"].contains(&value),
            Field::Priority => ["No priority", "Low", "Medium", "High"].contains(&value),
            Field::Labels => value.chars().count() <= 500 && !value.contains(['\r', '\n']),
        };
        if !valid
            || value.contains('\0')
            || !self.clock.contains_key(&self.writer)
            || self.clock.values().any(|&n| n == 0 || n >= (1u64 << 53))
        {
            return Err((StatusCode::BAD_REQUEST, "Invalid field edit."));
        }
        Ok(())
    }

    fn covers(&self, other: &Version) -> bool {
        other
            .clock
            .iter()
            .all(|(writer, counter)| self.clock.get(writer) >= Some(counter))
    }
}

// Keep only causally independent edits. Sorting these by estimated time and UUID
// gives every upload order the same winner, including after retries or a resolution.
pub fn merge(heads: &mut Vec<Version>, incoming: Version) {
    if heads.iter().any(|known| known.covers(&incoming)) {
        return;
    }
    heads.retain(|known| !incoming.covers(known));
    heads.push(incoming);
    heads.sort_by_key(|version| std::cmp::Reverse((version.time, version.writer)));
}

pub fn legacy_change(value: String, parents: &[Version], time: i64) -> Version {
    let writer = Uuid::nil();
    let mut clock: BTreeMap<Uuid, u64> = BTreeMap::new();
    for parent in parents {
        for (&device, &counter) in &parent.clock {
            let known = clock.entry(device).or_default();
            *known = (*known).max(counter);
        }
    }
    *clock.entry(writer).or_default() += 1;
    Version {
        value,
        time,
        writer,
        clock,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn change(device: u128, time: i64, value: &str) -> Version {
        let writer = Uuid::from_u128(device);
        Version {
            writer,
            time,
            value: value.into(),
            clock: BTreeMap::from([(writer, 1)]),
        }
    }

    #[test]
    fn concurrent_edits_converge_in_either_order() {
        let earlier = change(3, 40, "earlier");
        let tied = change(1, 50, "tied");
        let winner = change(2, 50, "winner");
        for order in [[&earlier, &tied, &winner], [&winner, &tied, &earlier]] {
            let mut heads = Vec::new();
            for version in order {
                merge(&mut heads, version.clone());
            }
            assert_eq!(heads, [winner.clone(), tied.clone(), earlier.clone()]);
        }
    }

    #[test]
    fn resolution_replaces_reviewed_values_and_survives_late_retries() {
        let a = change(1, 200, "first");
        let b = change(2, 300, "second");
        let unseen = change(3, 250, "unseen");
        let mut resolution = change(1, 100, "combined");
        resolution.clock.insert(a.writer, 2);
        resolution.clock.insert(b.writer, 1);
        for order in [
            [&a, &b, &resolution, &unseen],
            [&resolution, &unseen, &b, &a],
        ] {
            let mut heads = Vec::new();
            for version in order {
                merge(&mut heads, version.clone());
            }
            merge(&mut heads, resolution.clone());
            assert_eq!(heads, [unseen.clone(), resolution.clone()]);
        }
    }
}
