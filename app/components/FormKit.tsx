/**
 * FormKit — shared, farmer-first data-entry building blocks so every screen
 * follows the same principle: big thumb targets, bilingual (English + Hindi)
 * labels, no keyboard where a tap works, smart defaults, and one clear action.
 *
 * Use across all logging/registration forms:
 *   <FieldLabel en="Liters" hi="लीटर" />
 *   <DateField value={date} onChange={setDate} />          // Today/Yesterday + ‹ › — no typing
 *   <BigInput value={amt} onChangeText={setAmt} prefix="₹" numeric />
 *   <Stepper value={n} onChange={setN} />                  // +/- for counts
 *   <ChoiceGrid options={...} value={v} onChange={setV} /> // icon tiles
 *   <MoreDetails> ...optional fields... </MoreDetails>     // progressive disclosure
 *   <SaveButton en="Save" hi="सहेजें" onPress={save} saving={saving} />
 */
import { useState, ReactNode } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { useI18n } from "../lib/i18n";

const GREEN = "#2e7d32";
const GREEN_DK = "#1b5e20";

// ── dates (no external lib) ──
const toYMD = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
export const todayYMD = () => toYMD(new Date());
const shift = (ymd: string, n: number) => { const d = new Date(ymd + "T00:00:00"); d.setDate(d.getDate() + n); return toYMD(d); };
const pretty = (ymd: string) => {
  const d = new Date(ymd + "T00:00:00");
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
};

export function FieldLabel({ en, hi, required }: { en: string; hi?: string; required?: boolean }) {
  const { lang } = useI18n();
  const txt = lang === "hi" && hi ? hi : en;
  return <Text style={fk.label}>{txt}{required ? " *" : ""}</Text>;
}

/** Date picker with no keyboard — Today/Yesterday chips + a day stepper. */
export function DateField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t: tr } = useI18n();
  const t = todayYMD();
  const y = shift(t, -1);
  return (
    <View>
      <View style={fk.row}>
        <TouchableOpacity style={[fk.dateChip, value === t && fk.dateChipOn]} onPress={() => onChange(t)}>
          <Text style={[fk.dateChipText, value === t && fk.dateChipTextOn]}>{tr("common.today")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[fk.dateChip, value === y && fk.dateChipOn]} onPress={() => onChange(y)}>
          <Text style={[fk.dateChipText, value === y && fk.dateChipTextOn]}>{tr("common.yesterday")}</Text>
        </TouchableOpacity>
      </View>
      <View style={fk.stepperRow}>
        <TouchableOpacity style={fk.stepBtn} onPress={() => onChange(shift(value, -1))}><Text style={fk.stepSign}>‹</Text></TouchableOpacity>
        <Text style={fk.dateShown}>{pretty(value)}</Text>
        <TouchableOpacity style={[fk.stepBtn, value >= t && fk.stepBtnOff]} disabled={value >= t} onPress={() => onChange(shift(value, 1))}><Text style={fk.stepSign}>›</Text></TouchableOpacity>
      </View>
    </View>
  );
}

/** A big, thumb-friendly input. `prefix` (₹) / `suffix` (L, %) render inline. */
export function BigInput({
  value, onChangeText, placeholder, numeric, prefix, suffix, strong,
}: { value: string; onChangeText: (v: string) => void; placeholder?: string; numeric?: boolean; prefix?: string; suffix?: string; strong?: boolean }) {
  return (
    <View style={fk.bigWrap}>
      {prefix ? <Text style={fk.affix}>{prefix}</Text> : null}
      <TextInput
        style={[fk.bigInput, strong && fk.bigStrong]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#bbb"
        keyboardType={numeric ? "numeric" : "default"}
      />
      {suffix ? <Text style={fk.affix}>{suffix}</Text> : null}
    </View>
  );
}

/** +/- stepper for small counts (animals, quantities). */
export function Stepper({ value, onChange, min = 0, max = 999 }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <View style={fk.stepperRow}>
      <TouchableOpacity style={[fk.stepBtn, value <= min && fk.stepBtnOff]} disabled={value <= min} onPress={() => onChange(value - 1)}><Text style={fk.stepSign}>−</Text></TouchableOpacity>
      <Text style={fk.stepVal}>{value}</Text>
      <TouchableOpacity style={[fk.stepBtn, value >= max && fk.stepBtnOff]} disabled={value >= max} onPress={() => onChange(value + 1)}><Text style={fk.stepSign}>+</Text></TouchableOpacity>
    </View>
  );
}

/** Icon-tile choice grid (type of sale, expense category, etc.). */
export function ChoiceGrid<T extends string>({ options, value, onChange }: { options: { value: T; label: string; icon: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={fk.grid}>
      {options.map((o) => (
        <TouchableOpacity key={o.value} style={[fk.tile, value === o.value && fk.tileOn]} onPress={() => onChange(o.value)} activeOpacity={0.8}>
          <Text style={fk.tileIcon}>{o.icon}</Text>
          <Text style={[fk.tileLabel, value === o.value && fk.tileLabelOn]}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

/** Horizontal selectable chips (scope, animal picker). */
export function Chips<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T | null; onChange: (v: T) => void }) {
  return (
    <View style={fk.chipRow}>
      {options.map((o) => (
        <TouchableOpacity key={o.value} style={[fk.chip, value === o.value && fk.chipOn]} onPress={() => onChange(o.value)}>
          <Text style={[fk.chipText, value === o.value && fk.chipTextOn]}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

/** Progressive disclosure — hide optional fields until asked. */
export function MoreDetails({ children, label }: { children: ReactNode; label?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <View>
      <TouchableOpacity style={fk.moreBtn} onPress={() => setOpen(!open)}>
        <Text style={fk.moreText}>{open ? "▾" : "▸"} {label || t("common.more_details")}</Text>
      </TouchableOpacity>
      {open ? <View style={{ marginTop: 4 }}>{children}</View> : null}
    </View>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={fk.card}>{children}</View>;
}

export function SaveButton({ en, hi, onPress, saving, disabled }: { en: string; hi?: string; onPress: () => void; saving?: boolean; disabled?: boolean }) {
  const { lang, t } = useI18n();
  const label = lang === "hi" && hi ? hi : en;
  return (
    <TouchableOpacity style={[fk.save, (saving || disabled) && fk.saveOff]} onPress={onPress} disabled={saving || disabled} activeOpacity={0.85}>
      <Text style={fk.saveText}>{saving ? t("common.saving") : label}</Text>
    </TouchableOpacity>
  );
}

const fk = StyleSheet.create({
  label: { fontSize: 14, fontWeight: "700", color: "#444", marginTop: 14, marginBottom: 8 },
  labelHi: { fontSize: 13, fontWeight: "600", color: "#999" },
  row: { flexDirection: "row", gap: 10 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: "#eee" },

  // date + stepper
  dateChip: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: "#ddd", backgroundColor: "#fafafa", alignItems: "center" },
  dateChipOn: { borderColor: GREEN, backgroundColor: "#e8f5e9" },
  dateChipText: { fontSize: 14, fontWeight: "700", color: "#666" },
  dateChipTextOn: { color: GREEN_DK },
  stepperRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, gap: 12 },
  stepBtn: { width: 52, height: 52, borderRadius: 12, borderWidth: 1.5, borderColor: "#ddd", backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  stepBtnOff: { opacity: 0.35 },
  stepSign: { fontSize: 26, fontWeight: "800", color: GREEN_DK },
  dateShown: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: "#333" },
  stepVal: { flex: 1, textAlign: "center", fontSize: 24, fontWeight: "800", color: GREEN_DK },

  // big input
  bigWrap: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: "#ddd", borderRadius: 12, backgroundColor: "#fafafa", paddingHorizontal: 14, minHeight: 54 },
  affix: { fontSize: 18, fontWeight: "700", color: "#888" },
  bigInput: { flex: 1, fontSize: 18, fontWeight: "600", color: "#222", paddingVertical: 12, paddingHorizontal: 6 },
  bigStrong: { fontSize: 22, fontWeight: "800", color: GREEN_DK },

  // tiles + chips
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: { width: "31%", borderRadius: 14, borderWidth: 1.5, borderColor: "#e6e6e6", backgroundColor: "#fafafa", alignItems: "center", paddingVertical: 14 },
  tileOn: { borderColor: GREEN, backgroundColor: "#e8f5e9" },
  tileIcon: { fontSize: 28, marginBottom: 4 },
  tileLabel: { fontSize: 12, fontWeight: "700", color: "#666", textAlign: "center" },
  tileLabelOn: { color: GREEN_DK },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 999, borderWidth: 1.5, borderColor: "#ddd", backgroundColor: "#fafafa" },
  chipOn: { borderColor: GREEN, backgroundColor: "#e8f5e9" },
  chipText: { fontSize: 14, fontWeight: "700", color: "#666" },
  chipTextOn: { color: GREEN_DK },

  // more + save
  moreBtn: { paddingVertical: 12 },
  moreText: { fontSize: 14, fontWeight: "700", color: GREEN },
  save: { backgroundColor: GREEN, borderRadius: 14, paddingVertical: 18, alignItems: "center", marginTop: 4 },
  saveOff: { backgroundColor: "#b8c6bf" },
  saveText: { color: "#fff", fontSize: 17, fontWeight: "800" },
});
