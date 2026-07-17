/** Shared responsive helpers. Desktop = wide viewport (web / large tablet). */
import { useWindowDimensions } from "react-native";

export const DESKTOP_MIN = 900;

export function useIsDesktop() {
  return useWindowDimensions().width >= DESKTOP_MIN;
}

/**
 * On desktop, centre a screen's scroll content and cap it to a comfortable reading
 * width so rows/forms/buttons don't stretch across the whole column. Returns a style
 * to spread into a ScrollView's `contentContainerStyle` (undefined on phones).
 */
export function useContentMax(maxWidth = 620) {
  const isDesktop = useIsDesktop();
  return isDesktop ? ({ maxWidth, width: "100%", alignSelf: "center" } as const) : undefined;
}
