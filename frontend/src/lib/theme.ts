export const THEME_STORAGE_KEY = "ca-theme";

/**
 * Runs in <head> before first paint (see layout.tsx) so the page never flashes the
 * wrong theme. Light is the default look; a saved choice wins.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");document.documentElement.classList.toggle("dark",t==="dark");}catch(e){}})();`;
