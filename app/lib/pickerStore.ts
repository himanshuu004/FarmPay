/**
 * Tiny module-level store for cross-screen picker handoffs.
 *
 * When a wizard screen (e.g. postharvest-apply.tsx) navigates to a
 * picker screen (e.g. warehouse-list.tsx?mode=picker), the picker
 * writes the chosen value here and calls router.back(). The wizard
 * stays mounted in the Stack underneath the picker, so on resume its
 * useFocusEffect reads the store and hydrates form state.
 *
 * Why a module-level object instead of route params: router.replace
 * with params REMOUNTS the target screen, which resets all wizard
 * state back to step 1. router.back() preserves the underlying
 * screen, but React Navigation / Expo Router don't natively pass
 * return values between screens — hence this minimal scratch pad.
 *
 * Consumers MUST clear the slot after reading it (use consume*
 * helpers below) so a stale value doesn't leak into the next pick.
 */

interface WarehousePick {
  warehouseId: number;
  warehouseName: string;
}

// Single active pick. Null when nothing has been picked since the
// last consume. Only one picker is in flight at a time on the home
// screen graph, so a single slot is enough.
let _warehousePick: WarehousePick | null = null;

export function setWarehousePick(warehouseId: number, warehouseName: string): void {
  _warehousePick = { warehouseId, warehouseName };
}

/** Read and clear the pick in one call. Returns null if nothing is pending. */
export function consumeWarehousePick(): WarehousePick | null {
  const p = _warehousePick;
  _warehousePick = null;
  return p;
}
