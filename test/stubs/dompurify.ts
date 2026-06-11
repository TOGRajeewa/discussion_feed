// Passthrough stub for DOMPurify in unit tests (sanitize behaviour is the library's
// own concern; we only test our wrappers). Real sanitization is exercised in-browser.
export function sanitize(html: string): string { return html; }
export default { sanitize };
