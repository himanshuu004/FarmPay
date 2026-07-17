/**
 * ActivityMoneySection — contextual money discovery for activity drill-ins.
 *
 * Drops into activity-crop / activity-dairy / activity-horti / etc. as a
 * single line:
 *
 *   <ActivityMoneySection activityCode="DAIRY" />
 *
 * It surfaces the loan-module data that's relevant to THIS activity,
 * so a farmer browsing her dairy doesn't have to bounce out to a
 * separate Loans tab to discover bookmarks or bank-imported loans:
 *
 *   • Bank loans whose `loan_type` matches the activity (e.g. a
 *     DAIRY_LOAN bank-imported row shows up under the dairy activity)
 *     → tap → /bank-loan-detail?id=…
 *   • A 🔖 "Saved loan products" link (with the current bookmark count)
 *     → tap → /bookmarks
 *
 * Reads from the same /dice/loans/me + /dice/bookmarked-products
 * endpoints the persona home + Loans tab use, so no new backend
 * routes are needed and there's no extra fetch cost when these
 * activity screens are visited.
 *
 * Renders nothing during the first load (avoids a layout flash on
 * the activity screen) and degrades gracefully if either fetch
 * fails.
 */

import React, { useCallback, useState } from "react";
import { useRouter, useFocusEffect } from "expo-router";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { apiGet, formatRupees } from "../lib/api";

// ─── Types ───────────────────────────────────────────────────────

interface BankLoan {
  applicationId: number;
  productCode?: string;
  schemeName?: string | null;
  bankName?: string | null;
  outstandingAmount: number;
  smaClassification?: string;
  source?: "farmerpay" | "bank";
}

interface Bookmark {
  productId: number;
  productName: string | null;
}

// ─── Loan-type → activity mapping ────────────────────────────────
//
// loan_type enum on bank_loan_accounts (uppercased by farmerLoanFeedService
// into productCode):
//   agri_gold, consumption_gold, kcc_gold, allied_gold,
//   kcc, crop_loan, dairy_loan, livestock_loan,
//   horticulture_loan, fisheries_loan, animal_husbandry_loan,
//   input_loan, jlg, shg
//
// We bucket each into the activity it most directly serves. JLG/SHG
// are non-collateral group loans that can fund any activity, so they
// don't get a bucket — they show in the persona home Money tab only.
const LOAN_TYPE_MAP: Record<string, string[]> = {
  CROP:    ["KCC", "CROP_LOAN", "INPUT_LOAN", "KCC_GOLD", "AGRI_GOLD"],
  DAIRY:   ["DAIRY_LOAN"],
  HORTI:   ["HORTICULTURE_LOAN"],
  FISHERY: ["FISHERIES_LOAN"],
  POULTRY: ["LIVESTOCK_LOAN", "ANIMAL_HUSBANDRY_LOAN"],
  GOATERY: ["LIVESTOCK_LOAN", "ANIMAL_HUSBANDRY_LOAN"],
};

const ACTIVITY_LABEL: Record<string, string> = {
  CROP:    "crop",
  DAIRY:   "dairy",
  HORTI:   "horticulture",
  FISHERY: "fishery",
  POULTRY: "poultry",
  GOATERY: "goatery",
};

// ─── SMA badge style ─────────────────────────────────────────────

const SMA_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  sma_0: { bg: "#fff8e1", fg: "#7c5800", label: "SMA-0" },
  sma_1: { bg: "#fff3e0", fg: "#e65100", label: "SMA-1" },
  sma_2: { bg: "#ffe0b2", fg: "#bf360c", label: "SMA-2" },
  npa:   { bg: "#fbe9e7", fg: "#c62828", label: "NPA" },
};

// ─── Component ───────────────────────────────────────────────────

export default function ActivityMoneySection({ activityCode }: { activityCode: string }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [bankLoans, setBankLoans] = useState<BankLoan[]>([]);
  const [bookmarkCount, setBookmarkCount] = useState(0);

  const allowedTypes = LOAN_TYPE_MAP[activityCode] || [];
  const activityLabel = ACTIVITY_LABEL[activityCode] || "this activity";

  const load = useCallback(async () => {
    try {
      const [loansRes, bmRes] = await Promise.all([
        apiGet("/dice/loans/me").catch(() => null),
        apiGet("/dice/bookmarked-products").catch(() => null),
      ]);
      const allLoans: BankLoan[] =
        loansRes?.data?.loans || loansRes?.data?.items || [];
      const filtered = allLoans.filter(
        (l) =>
          l.source === "bank" &&
          allowedTypes.includes((l.productCode || "").toUpperCase()),
      );
      setBankLoans(filtered);

      const bms: Bookmark[] = Array.isArray(bmRes?.data)
        ? bmRes.data
        : Array.isArray(bmRes?.data?.items)
          ? bmRes.data.items
          : [];
      setBookmarkCount(bms.length);
    } catch {
      /* tolerate partial failures — section degrades to bookmarks-only */
    } finally {
      setLoaded(true);
    }
  }, [activityCode]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Render nothing during the first load to avoid a layout flash on the
  // activity screen. Once loaded, render even if the bank-loans list is
  // empty — the bookmarks link is still useful.
  if (!loaded) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>💰 Money for this {activityLabel}</Text>

      {/* Bank loans tagged to this activity */}
      {bankLoans.length === 0 ? (
        <Text style={styles.emptyText}>
          No bank loans tagged to this {activityLabel} yet.
        </Text>
      ) : (
        bankLoans.map((loan) => {
          const sma = loan.smaClassification && loan.smaClassification !== "standard"
            ? SMA_STYLE[loan.smaClassification]
            : null;
          return (
            <TouchableOpacity
              key={loan.applicationId}
              style={styles.loanCard}
              onPress={() =>
                router.push(`/bank-loan-detail?id=${loan.applicationId}` as any)
              }
              activeOpacity={0.85}
            >
              <Text style={styles.loanEmoji}>🏦</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.loanTitle} numberOfLines={1}>
                  {loan.schemeName || loan.productCode || "Bank loan"}
                </Text>
                <Text style={styles.loanSub} numberOfLines={1}>
                  {loan.bankName ? loan.bankName + " · " : ""}
                  {formatRupees(loan.outstandingAmount)} outstanding
                </Text>
              </View>
              {sma && (
                <View style={[styles.smaBadge, { backgroundColor: sma.bg }]}>
                  <Text style={[styles.smaBadgeText, { color: sma.fg }]}>
                    {sma.label}
                  </Text>
                </View>
              )}
              <Text style={styles.arrow}>›</Text>
            </TouchableOpacity>
          );
        })
      )}

      {/* Bookmarks link — always visible */}
      <TouchableOpacity
        style={styles.bookmarksLink}
        onPress={() => router.push("/bookmarks" as any)}
        activeOpacity={0.85}
      >
        <Text style={styles.bookmarksEmoji}>🔖</Text>
        <Text style={styles.bookmarksText}>
          Saved loan products
          {bookmarkCount > 0 ? ` (${bookmarkCount})` : ""}
        </Text>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────

const styles = StyleSheet.create({
  section: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderLeftWidth: 4,
    borderLeftColor: "#7c5800",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#7c5800",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 10,
  },

  loanCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#fff8e1",
    marginBottom: 8,
  },
  loanEmoji: { fontSize: 18 },
  loanTitle: { fontSize: 13, fontWeight: "800", color: "#5d4037" },
  loanSub: { fontSize: 11, color: "#7c5800", marginTop: 2 },

  smaBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  smaBadgeText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.3 },

  emptyText: {
    fontSize: 12,
    color: "#999",
    fontStyle: "italic",
    marginBottom: 10,
    paddingHorizontal: 4,
  },

  bookmarksLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ffcc80",
    backgroundColor: "#fffbe6",
  },
  bookmarksEmoji: { fontSize: 16 },
  bookmarksText: { flex: 1, fontSize: 13, fontWeight: "700", color: "#7c5800" },

  arrow: { fontSize: 18, color: "#bbb" },
});
