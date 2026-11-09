/**
 * CDN entry point. Bundled to `public/simplecookies.js` (IIFE) and served at
 * `https://oxygenlow.com/simplecookies.js`.
 *
 * Usage: <script src="https://oxygenlow.com/simplecookies.js"
 *              data-api-key="sk_..." defer></script>
 */
import { autoInitFromScriptTag } from "./banner.js";

// Auto-init when this bundle is loaded as a classic <script> tag.
// document.currentScript is available during initial execution.
autoInitFromScriptTag();
