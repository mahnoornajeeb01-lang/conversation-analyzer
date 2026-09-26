export const THEME_STORAGE_KEY = "ca-theme";

/**
 * Runs in <head> before first paint (see layout.tsx) so the page never flashes the
 * wrong theme. Dark is the dashboard's default look; a saved choice wins.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");document.documentElement.classList.toggle("dark",t!=="light");}catch(e){document.documentElement.classList.add("dark");}})();`;
