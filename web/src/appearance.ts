const key = "sync-line:appearance";

export function readAppearance() {
  return localStorage.getItem(key) === "light" ? "light" : "dark";
}

export function applyAppearance() {
  const root = document.documentElement;
  root.dataset.appearance = readAppearance();
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content", getComputedStyle(root).getPropertyValue("--canvas").trim(),
  );
}

export function changeAppearance() {
  localStorage.setItem(key, readAppearance() === "dark" ? "light" : "dark");
  applyAppearance();
}

window.addEventListener("storage", (event) => {
  if (event.key === key || event.key === null) applyAppearance();
});
