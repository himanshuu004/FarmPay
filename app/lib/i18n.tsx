/**
 * i18n — two-language support (Hindi + English), Hindi-first for the target
 * clientele. Lightweight, no external lib: a flat dictionary + a context hook.
 *
 *   const { t, lang, setLang } = useI18n();
 *   <Text>{t("common.save")}</Text>
 *
 * Default language is Hindi ('hi'); the choice is persisted (AsyncStorage) and
 * togglable anywhere via <LangToggle/>. Missing keys fall back to English then
 * to the key itself, so a partially-translated screen never blanks out.
 */
import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import fragLogs from "./strings/frag_logs";
import fragSociety from "./strings/frag_society";
import fragKcc from "./strings/frag_kcc";
import fragPashu from "./strings/frag_pashu";
import fragDairy from "./strings/frag_dairy";
import fragCia from "./strings/frag_cia";

export type Lang = "hi" | "en";
type Entry = { en: string; hi: string };

// ── Dictionary. Namespaced by surface. Extend per screen. ──
const STRINGS: Record<string, Entry> = {
  // common / shared (used by FormKit + everywhere)
  "common.save": { en: "Save", hi: "सहेजें" },
  "common.saving": { en: "Saving…", hi: "सहेज रहे हैं…" },
  "common.cancel": { en: "Cancel", hi: "रद्द करें" },
  "common.done": { en: "Done", hi: "हो गया" },
  "common.ok": { en: "OK", hi: "ठीक है" },
  "common.back": { en: "Back", hi: "वापस" },
  "common.today": { en: "Today", hi: "आज" },
  "common.yesterday": { en: "Yesterday", hi: "कल" },
  "common.more_details": { en: "More details", hi: "और जानकारी" },
  "common.optional": { en: "Optional", hi: "वैकल्पिक" },
  "common.whole_herd": { en: "Whole herd", hi: "पूरा झुंड" },
  "common.one_animal": { en: "One animal", hi: "एक पशु" },
  "common.amount": { en: "Amount", hi: "राशि" },
  "common.note": { en: "Note", hi: "टिप्पणी" },
  "common.when": { en: "When?", hi: "कब?" },
  "common.for": { en: "For", hi: "किसके लिए" },
  "common.saved": { en: "Saved ✓", hi: "सहेज लिया ✓" },
  "common.not_saved": { en: "Not saved", hi: "सहेजा नहीं गया" },
  "common.try_again": { en: "Try again", hi: "फिर कोशिश करें" },
  "common.error": { en: "Error", hi: "त्रुटि" },
  "common.offline_retry": { en: "Cannot connect. Your entry will retry when back online.", hi: "कनेक्ट नहीं हो पा रहा। ऑनलाइन होने पर आपकी जानकारी दोबारा भेजी जाएगी।" },
  "common.enter_amount": { en: "Enter an amount", hi: "राशि दर्ज करें" },
  "common.pick_animal": { en: "Choose which animal this is for, or switch to Whole herd.", hi: "चुनें कि यह किस पशु के लिए है, या पूरा झुंड चुनें।" },
  "common.language": { en: "Language", hi: "भाषा" },

  // nav / screen titles
  "nav.pashu_home": { en: "Pashu Suraksha", hi: "पशु सुरक्षा" },
  "nav.pashu_animals": { en: "My animals", hi: "मेरे पशु" },
  "nav.pashu_vault": { en: "Policy vault", hi: "पॉलिसी तिजोरी" },
  "nav.pashu_quote": { en: "Premium quote", hi: "प्रीमियम अनुमान" },
  "nav.pashu_enrol": { en: "Insure an animal", hi: "पशु का बीमा करें" },
  "nav.pashu_claim": { en: "Claims", hi: "दावे" },
  "nav.pashu_renew": { en: "Renewals", hi: "नवीनीकरण" },
  "nav.kcc_calculator": { en: "KCC calculator", hi: "केसीसी कैलकुलेटर" },
  "nav.kcc_apply": { en: "Apply for KCC", hi: "केसीसी आवेदन" },
  "nav.kcc_eligibility": { en: "Eligibility & trust", hi: "पात्रता और भरोसा" },
  "nav.kcc_limit": { en: "Your KCC", hi: "आपका केसीसी" },
  "nav.kcc_drawdown": { en: "LT drawdown", hi: "दीर्घकालिक निकासी" },
  "nav.kcc_pack": { en: "Banker pack", hi: "बैंकर पैक" },
  "nav.society_passbook": { en: "My Society", hi: "मेरी समिति" },
  "nav.society_order": { en: "Order inputs", hi: "इनपुट ऑर्डर करें" },
  "nav.society_orders": { en: "My orders", hi: "मेरे ऑर्डर" },
  "nav.activity_dairy": { en: "Dairy", hi: "डेयरी" },
  "nav.setup_dairy": { en: "Set up dairy", hi: "डेयरी सेट करें" },
  "nav.activity_goatery": { en: "Goatery", hi: "बकरी पालन" },
  "nav.setup_goatery": { en: "Set up goatery", hi: "बकरी पालन सेट करें" },
  "nav.activity_poultry": { en: "Poultry", hi: "मुर्गी पालन" },
  "nav.setup_poultry": { en: "Set up poultry", hi: "मुर्गी पालन सेट करें" },
  "nav.dairy_animals": { en: "My animals", hi: "मेरे पशु" },
  "nav.dairy_logbook": { en: "Dairy logbook", hi: "डेयरी बही" },
  "nav.dairy_log_cost": { en: "Log expense", hi: "खर्च दर्ज करें" },
  "nav.dairy_log_revenue": { en: "Log revenue", hi: "आय दर्ज करें" },
  "nav.dairy_breeding": { en: "Breeding", hi: "प्रजनन" },
  "nav.dairy_treatment": { en: "Treatment", hi: "इलाज" },
  "nav.dairy_pnl": { en: "Dairy P&L", hi: "डेयरी लाभ-हानि" },

  // tab bar
  "tab.home": { en: "Home", hi: "होम" },
  "tab.society": { en: "Society", hi: "समिति" },
  "tab.kcc": { en: "KCC", hi: "केसीसी" },
  "tab.suraksha": { en: "Suraksha", hi: "सुरक्षा" },
  "tab.farm": { en: "Farm", hi: "खेती" },

  // home
  "home.greeting": { en: "Namaste", hi: "नमस्ते" },
  "home.record_today": { en: "What would you like to record today?", hi: "आज आप क्या दर्ज करना चाहेंगे?" },
  "home.log_milk": { en: "Log Milk", hi: "दूध लिखें" },
  "home.log_expense": { en: "Log Expense", hi: "खर्च लिखें" },
  "home.logbook": { en: "Logbook", hi: "बही" },
  "home.animals": { en: "Animals", hi: "पशु" },
  "home.treatment": { en: "Treatment", hi: "इलाज" },
  "home.credit_ready": { en: "Input credit ready", hi: "इनपुट क्रेडिट तैयार" },
  "home.milk_dues": { en: "Milk dues owed", hi: "दूध बकाया" },
  "home.my_accounts": { en: "My accounts", hi: "मेरे खाते" },
  "home.milk_passbook": { en: "Milk passbook", hi: "दूध पासबुक" },
  "home.passbook_sub": { en: "Society dues & input credit", hi: "समिति बकाया और इनपुट क्रेडिट" },
  "home.join_society": { en: "Join your society to unlock", hi: "अनलॉक करने के लिए समिति से जुड़ें" },
  "home.your_kcc": { en: "Your KCC", hi: "आपका केसीसी" },
  "home.kcc_limit": { en: "KCC limit", hi: "केसीसी सीमा" },
  "home.kcc_unlock": { en: "Unlock credit from your logbook — no forms", hi: "अपनी बही से क्रेडिट पाएँ — कोई फॉर्म नहीं" },
  "home.animal_insurance": { en: "Animal insurance", hi: "पशु बीमा" },
  "home.protect": { en: "Protect your animals", hi: "अपने पशुओं की रक्षा करें" },
  "home.once_a_season": { en: "once a season", hi: "मौसम में एक बार" },
  "home.renewal_due": { en: "policy renewal due — one tap keeps cover going.", hi: "पॉलिसी नवीनीकरण बाकी — एक टैप में बीमा जारी रखें।" },

  // revenue (log milk / earning)
  "rev.what_sold": { en: "What did you sell?", hi: "आपने क्या बेचा?" },
  "rev.milk_sold": { en: "Milk sold", hi: "दूध बेचा" },
  "rev.litres": { en: "Litres", hi: "लीटर" },
  "rev.rate": { en: "Rate/L", hi: "रेट/लीटर" },
  "rev.amount_received": { en: "Amount received", hi: "मिली राशि" },
  "rev.auto_milk": { en: "Auto-filled from litres × rate — you can edit it.", hi: "लीटर × रेट से अपने आप भरा — बदल सकते हैं।" },
  "rev.save": { en: "Save earning", hi: "आय सहेजें" },
  "rev.paid_by": { en: "Paid by", hi: "किसने दिया" },
  "rev.recorded": { en: "Your earning is recorded.", hi: "आपकी आय दर्ज हो गई।" },
  "rev.cat.milk_coop": { en: "Milk → Society", hi: "दूध → समिति" },
  "rev.cat.milk_direct": { en: "Milk → Direct", hi: "दूध → सीधे" },
  "rev.cat.animal": { en: "Animal sale", hi: "पशु बिक्री" },
  "rev.cat.calf": { en: "Calf sale", hi: "बछड़ा बिक्री" },
  "rev.cat.manure": { en: "Manure", hi: "गोबर" },
  "rev.cat.subsidy": { en: "Subsidy", hi: "सब्सिडी" },
  "rev.cat.insurance": { en: "Insurance", hi: "बीमा" },
  "rev.cat.other": { en: "Other", hi: "अन्य" },

  // cost (log expense)
  "cost.what_spent": { en: "What did you spend on?", hi: "आपने किस पर खर्च किया?" },
  "cost.how_much": { en: "How much?", hi: "कितना?" },
  "cost.quantity": { en: "Quantity", hi: "मात्रा" },
  "cost.price_unit": { en: "Price/unit", hi: "प्रति इकाई भाव" },
  "cost.total_spent": { en: "Total spent", hi: "कुल खर्च" },
  "cost.auto_qty": { en: "Auto-filled from quantity × price — you can edit it.", hi: "मात्रा × भाव से अपने आप भरा — बदल सकते हैं।" },
  "cost.how_paid": { en: "How paid?", hi: "कैसे चुकाया?" },
  "cost.formal_informal": { en: "Formal = with bill · Informal = cash, no bill", hi: "औपचारिक = बिल के साथ · अनौपचारिक = नकद, बिना बिल" },
  "cost.formal": { en: "Formal ₹", hi: "औपचारिक ₹" },
  "cost.informal": { en: "Informal ₹", hi: "अनौपचारिक ₹" },
  "cost.vendor": { en: "Shop / vendor", hi: "दुकान / विक्रेता" },
  "cost.save": { en: "Save expense", hi: "खर्च सहेजें" },
  "cost.recorded": { en: "Your expense is recorded.", hi: "आपका खर्च दर्ज हो गया।" },
  "cost.cat.feed": { en: "Feed", hi: "दाना" },
  "cost.cat.fodder": { en: "Fodder", hi: "चारा" },
  "cost.cat.labour": { en: "Labour", hi: "मज़दूरी" },
  "cost.cat.medicine": { en: "Medicine", hi: "दवा" },
  "cost.cat.vet": { en: "Vet", hi: "पशु-चिकित्सक" },
  "cost.cat.vaccine": { en: "Vaccine", hi: "टीका" },
  "cost.cat.electric": { en: "Electric", hi: "बिजली" },
  "cost.cat.water": { en: "Water", hi: "पानी" },
  "cost.cat.transport": { en: "Transport", hi: "ढुलाई" },
  "cost.cat.equipment": { en: "Equipment", hi: "उपकरण" },
  "cost.cat.other": { en: "Other", hi: "अन्य" },
  // Per-screen fragments (each owned by one converter → no merge conflicts).
  ...fragLogs, ...fragSociety, ...fragKcc, ...fragPashu, ...fragDairy, ...fragCia,
};

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (key: string, fallback?: string) => string };
const I18nContext = createContext<Ctx>({ lang: "hi", setLang: () => {}, t: (k) => k });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("hi");
  useEffect(() => { AsyncStorage.getItem("fp_lang").then((v) => { if (v === "en" || v === "hi") setLangState(v); }); }, []);
  const setLang = (l: Lang) => { setLangState(l); AsyncStorage.setItem("fp_lang", l).catch(() => {}); };
  const t = (key: string, fallback?: string) => {
    const e = STRINGS[key];
    if (!e) return fallback ?? key;
    return e[lang] || e.en || fallback || key;
  };
  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);

/** A compact हिं | EN toggle. Drop into a header or a settings row. */
export function LangToggle({ light }: { light?: boolean }) {
  const { lang, setLang } = useI18n();
  return (
    <View style={tg.wrap}>
      {(["hi", "en"] as Lang[]).map((l) => {
        const on = lang === l;
        return (
          <TouchableOpacity key={l} onPress={() => setLang(l)} style={[tg.btn, on && tg.btnOn, on && light && tg.btnOnLight]}>
            <Text style={[tg.text, light && tg.textLight, on && tg.textOn, on && light && tg.textOnLight]}>{l === "hi" ? "हिं" : "EN"}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const tg = StyleSheet.create({
  wrap: { flexDirection: "row", borderRadius: 999, overflow: "hidden", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.6)" },
  btn: { paddingHorizontal: 12, paddingVertical: 5 },
  btnOn: { backgroundColor: "#fff" },
  btnOnLight: { backgroundColor: "#fff" },
  text: { fontSize: 13, fontWeight: "800", color: "rgba(255,255,255,0.9)" },
  textLight: { color: "rgba(255,255,255,0.9)" },
  textOn: { color: "#0f7a4d" },
  textOnLight: { color: "#0f7a4d" },
});
