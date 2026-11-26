import { expect, test } from "bun:test";
import { compareIssues, positionBetween } from "../src/issueOrder";

test("concurrent placements in the same gap allow a later insertion between them", () => {
  const row = (number: number) => ({
    id: crypto.randomUUID(),
    number,
    position: "",
  });
  const first = row(1),
    last = row(2),
    a = row(3),
    b = row(4),
    middle = row(5);
  a.position = positionBetween(a, first, last);
  b.position = positionBetween(b, first, last);
  const [left, right] = [a, b].sort(compareIssues);
  middle.position = positionBetween(middle, left, right);
  expect([right, middle, first, left, last].sort(compareIssues)).toEqual([
    first,
    left,
    middle,
    right,
    last,
  ]);
});
