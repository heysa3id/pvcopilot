/**
 * Polyfill for Promise.withResolvers (ES2024).
 * Must run before any code that uses it (e.g. pdfjs-dist).
 * Required for Safari < 17.4 and other older browsers.
 */
if (typeof Promise !== "undefined" && typeof Promise.withResolvers !== "function") {
  Promise.withResolvers = function withResolvers() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}
