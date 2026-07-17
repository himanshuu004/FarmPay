/** i18n fragment: society screens. Keys are "namespace.key" → { en, hi }. */
const frag: Record<string, { en: string; hi: string }> = {
  // society-order
  "soc.available_credit": { en: "Available credit", hi: "उपलब्ध सीमा" },
  "soc.choose_items": { en: "Choose items to order", hi: "ऑर्डर के लिए सामान चुनें" },
  "soc.per_unit": { en: "per", hi: "प्रति" },
  "soc.no_items": { en: "No items in the catalog yet.", hi: "अभी कोई सामान उपलब्ध नहीं है।" },
  "soc.total": { en: "Total", hi: "कुल राशि" },
  "soc.over_limit_warn": { en: "Over your available credit — reduce the order.", hi: "आपकी उपलब्ध सीमा से ज़्यादा — ऑर्डर घटाएँ।" },
  "soc.empty_cart_title": { en: "Empty cart", hi: "खाली कार्ट" },
  "soc.empty_cart_msg": { en: "Add at least one item.", hi: "कम से कम एक सामान जोड़ें।" },
  "soc.order_create_fail": { en: "Could not create order", hi: "ऑर्डर नहीं बन सका" },
  "soc.order_submitted_title": { en: "Order submitted", hi: "ऑर्डर भेज दिया गया" },
  "soc.order_submitted_msg": { en: "Your society will process it. Track it under My orders.", hi: "आपकी समिति इसे आगे बढ़ाएगी। मेरे ऑर्डर में देखें।" },
  "soc.not_submitted_title": { en: "Not submitted", hi: "नहीं भेजा गया" },
  "soc.not_submitted_msg": { en: "Ordering may be closed or over your limit.", hi: "ऑर्डर का समय बंद हो सकता है या सीमा से ज़्यादा है।" },
  "soc.connect_society_fail": { en: "Cannot connect to the society. Check your connection.", hi: "समिति से कनेक्ट नहीं हो पा रहा। अपना कनेक्शन जाँचें।" },

  // society-passbook
  "soc.nudge_title": { en: "Join your village dairy society", hi: "अपने गाँव की दुग्ध समिति से जुड़ें" },
  "soc.nudge_body": { en: "Members get a milk passbook, input credit up to 70% of their milk dues, and a path to a KCC.", hi: "सदस्यों को दूध पासबुक, दूध के बकाया का 70% तक इनपुट क्रेडिट, और KCC तक पहुँच मिलती है।" },
  "soc.nudge_cta": { en: "Find my society", hi: "मेरी समिति खोजें" },
  "soc.outstanding": { en: "Outstanding milk payment", hi: "बकाया दूध भुगतान" },
  "soc.input_credit": { en: "Input credit — 70% of dues", hi: "इनपुट क्रेडिट — बकाया का 70%" },
  "soc.available": { en: "available", hi: "उपलब्ध" },
  "soc.repaid_note": { en: "Repaid against your milk by the society. Never part of your KCC limit.", hi: "समिति आपके दूध से इसकी वसूली करती है। यह आपकी KCC सीमा का हिस्सा नहीं है।" },
  "soc.order_inputs": { en: "Order inputs", hi: "इनपुट ऑर्डर करें" },
  "soc.my_orders": { en: "My orders", hi: "मेरे ऑर्डर" },
  "soc.kcc_cta_title": { en: "💳 Unlock a KCC", hi: "💳 KCC पाएँ" },
  "soc.kcc_cta_text": { en: "Your milk history + logbook build a composite Kisan Credit Card — no forms.", hi: "आपका दूध रिकॉर्ड और लॉगबुक मिलकर किसान क्रेडिट कार्ड बनाते हैं — बिना किसी फॉर्म के।" },
  "soc.milk_supplied": { en: "Milk supplied", hi: "आपूर्ति किया दूध" },
  "soc.no_milk": { en: "No milk records yet.", hi: "अभी कोई दूध रिकॉर्ड नहीं है।" },
  "soc.col_month": { en: "Month", hi: "महीना" },
  "soc.col_litres": { en: "Litres", hi: "लीटर" },
  "soc.col_value": { en: "Value", hi: "मूल्य" },

  // society-orders
  "soc.no_orders": { en: "No orders yet.", hi: "अभी कोई ऑर्डर नहीं है।" },
  "soc.confirm_receipt": { en: "Confirm receipt", hi: "रसीद पक्की करें" },
  "soc.receipt_confirmed_title": { en: "Receipt confirmed", hi: "रसीद पक्की हुई" },
  "soc.receipt_confirmed_msg": { en: "Logged as a feed cost in your dairy P&L.", hi: "आपके डेयरी हिसाब में चारे की लागत के रूप में दर्ज किया गया।" },
  "soc.not_confirmed_title": { en: "Not confirmed", hi: "पक्की नहीं हुई" },
  "soc.connect_fail": { en: "Cannot connect. Check your connection.", hi: "कनेक्ट नहीं हो पा रहा। अपना कनेक्शन जाँचें।" },
  // order status labels
  "soc.status.draft": { en: "Draft", hi: "ड्राफ़्ट" },
  "soc.status.submitted": { en: "Submitted", hi: "भेजा गया" },
  "soc.status.secretary_approved": { en: "Secretary approved", hi: "सचिव ने मंज़ूर किया" },
  "soc.status.supervisor_approved": { en: "Supervisor approved", hi: "पर्यवेक्षक ने मंज़ूर किया" },
  "soc.status.processing": { en: "Processing", hi: "तैयारी में" },
  "soc.status.dispatched": { en: "Dispatched", hi: "भेज दिया गया" },
  "soc.status.received": { en: "Received", hi: "प्राप्त हुआ" },
  "soc.status.rejected": { en: "Rejected", hi: "अस्वीकृत" },
};
export default frag;
