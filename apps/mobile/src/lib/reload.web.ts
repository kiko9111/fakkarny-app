/** Restart the app (language/RTL changes need it). The hosted preview remembers its real address. */
export async function reloadApp() {
  const href = (window as { __ZAKI_HREF__?: string }).__ZAKI_HREF__;
  if (href) window.location.replace(href);
  else window.location.reload();
}
