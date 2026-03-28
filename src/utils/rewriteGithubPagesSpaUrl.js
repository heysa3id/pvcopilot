/**
 * GitHub Pages returns 404.html for deep links; it redirects to /?/<encodedPath>.
 * Normalize to a real pathname so React Router matches. Uses a full same-origin URL
 * in replaceState because path-only URLs can mis-resolve when the current URL has
 * this non-standard query shape.
 */
export function rewriteGithubPagesSpaUrl() {
  if (typeof window === 'undefined') return;
  const l = window.location;
  if (l.search.length < 2 || l.search.charAt(1) !== '/') return;
  const decoded = l.search
    .slice(1)
    .split('&')
    .map((s) => s.replace(/~and~/g, '&'))
    .join('?');
  const path = l.pathname.replace(/\/$/, '') + decoded;
  window.history.replaceState(null, '', l.origin + path + l.hash);
}
