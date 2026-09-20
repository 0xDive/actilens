import { dragWindow } from "./dragWindow";

/**
 * AuthTitleBar — the custom (Overlay) window title bar for the auth / onboarding
 * surfaces: a draggable strip with the app name centered. The native macOS
 * traffic lights overlay the left. No tray/tracking icon here — tracking is
 * paused until setup completes, so there's no state to show. "ActiLens"
 * is the brand and stays verbatim in every locale.
 */
export function AuthTitleBar() {
  // Windows keeps its native caption controls; the old custom strip only created
  // a blank 40px band above auth/onboarding content.
  if (navigator.userAgent.includes("Windows")) return null;

  return (
    <div className="welcome-titlebar" onMouseDown={dragWindow}>
      <span className="welcome-titlebar-title">ActiLens</span>
    </div>
  );
}
