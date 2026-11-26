export const labelsMaxLength = 500;

export function IssueLabels({ value }: { value: string }) {
  const names = new Map<string, string>();
  for (const part of value.split(",")) {
    const label = part.trim();
    const key = label.toLowerCase();
    if (label && !names.has(key)) names.set(key, label);
  }
  if (!names.size) return null;
  return (
    <span className="issue-labels">
      {Array.from(names, ([key, label]) => (
        <span key={key}>{label}</span>
      ))}
    </span>
  );
}
