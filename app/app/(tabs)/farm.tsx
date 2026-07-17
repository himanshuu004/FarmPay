/**
 * Farm tab — pick a livestock activity. Dairy is full-featured; goat/poultry
 * reuse the shared register + logbook + P&L. Pushes to the activity hubs.
 */
import { useRouter } from "expo-router";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";

const ACTIVITIES = [
  { icon: "🐄", title: "Dairy", desc: "Herd register · logbook · P&L", route: "/activity-dairy" },
  { icon: "🐐", title: "Goatery", desc: "Register, log costs & sales", route: "/activity-goatery" },
  { icon: "🐔", title: "Poultry", desc: "Flock, costs & sales", route: "/activity-poultry" },
];

export default function FarmTab() {
  const router = useRouter();
  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.lede}>Your logbook is your credit file — record daily, and it builds your KCC.</Text>
      {ACTIVITIES.map((a) => (
        <TouchableOpacity key={a.title} style={styles.card} onPress={() => router.push(a.route as any)} activeOpacity={0.85}>
          <Text style={styles.icon}>{a.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{a.title}</Text>
            <Text style={styles.desc}>{a.desc}</Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  lede: { color: "#555", fontSize: 14, lineHeight: 20, marginBottom: 16 },
  card: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "#fff", borderRadius: 16, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: "#eee" },
  icon: { fontSize: 30 },
  title: { fontSize: 17, fontWeight: "800", color: "#1b5e20" },
  desc: { fontSize: 13, color: "#888", marginTop: 2 },
  arrow: { fontSize: 24, color: "#ccc" },
});
