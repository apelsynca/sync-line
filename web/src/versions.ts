import type seeds from "../shared/demo-v1.json";

export type Fields = (typeof seeds)[number];
export const emptyFields: Fields = {
  title: "",
  description: "",
  status: "Todo",
  assignee: "",
  priority: "No priority",
};

export const fieldNames = [
  "title",
  "description",
  "status",
  "priority",
  "assignee",
] as const;
export type Field = keyof Fields;
export type Version = {
  value: string;
  time: number;
  writer: string;
  clock: Record<string, number>;
};
export type Versions = Partial<Record<Field, Version[]>>;
export type Changes = Partial<Record<Field, Version>>;

function covers(a: Version, b: Version) {
  return Object.entries(b.clock).every(
    ([device, n]) => (a.clock[device] ?? 0) >= n,
  );
}

export function withPending(heads: Version[], edit: Version) {
  if (heads.some((known) => covers(known, edit))) return heads;
  const concurrent = heads.filter((known) => !covers(edit, known));
  return [...concurrent, edit].sort(
    (a, b) =>
      b.time - a.time ||
      (a.writer < b.writer ? 1 : a.writer > b.writer ? -1 : 0),
  );
}

export function newVersion(
  value: string,
  parents: Version[],
  writer: string,
  time: number,
): Version {
  const clock: Record<string, number> = {};
  for (const parent of parents) {
    for (const [device, counter] of Object.entries(parent.clock)) {
      clock[device] = Math.max(clock[device] ?? 0, counter);
    }
  }
  clock[writer] = (clock[writer] ?? 0) + 1;
  return { value, time, writer, clock };
}
