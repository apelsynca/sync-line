import { generateKeyBetween } from "fractional-indexing";
import type { Issue } from "./workspace";

type OrderedIssue = Pick<Issue, "id" | "number" | "position">;

function suffix(issue: OrderedIssue) {
  // Equal offline placements still have distinct keys, even before a renumber.
  return issue.id.replaceAll("-", "") + "V";
}

function orderKey(issue: OrderedIssue) {
  // Use issue-number order for older cards. The shared integer prefix leaves
  // room to insert before the first or after the last fractional key.
  const position = issue.position || issue.number.toString(16).padStart(8, "0");
  return "a0" + position + suffix(issue);
}

export function compareIssues(a: OrderedIssue, b: OrderedIssue) {
  const left = orderKey(a);
  const right = orderKey(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

export function positionBetween(
  issue: OrderedIssue,
  previous?: OrderedIssue,
  next?: OrderedIssue,
) {
  const lower = previous ? orderKey(previous) : "a0";
  const upper = next ? orderKey(next) : "a1";
  let key = generateKeyBetween(lower, upper);
  // A midpoint can be a prefix of the upper key. Leave room for the ID.
  while (key + suffix(issue) >= upper) key = generateKeyBetween(lower, key);
  return key.slice(2);
}
