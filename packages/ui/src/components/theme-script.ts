export const themeDetectorScript = `(() => {
  const storedTheme = localStorage.getItem("theme-mode") ?? "auto";
  const theme = ["light", "dark", "auto"].includes(storedTheme)
    ? storedTheme
    : "auto";

  if (theme === "auto") {
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
    document.documentElement.classList.add(systemTheme, "auto");
  } else {
    document.documentElement.classList.add(theme);
  }
})();`;
