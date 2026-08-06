/**
 * Danbridge Scheduler — DOM Utilities (V15.3)
 *
 * 保留舊版全域 `$()` API，避免修改既有業務功能的呼叫方式。
 */
function $(id) {
  return document.getElementById(id);
}
