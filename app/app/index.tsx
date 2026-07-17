/**
 * Entry router. No token → login; otherwise into the dairy hub. (The full
 * persona state machine — resume-setup, multi-activity tabs — lands when the
 * society/KCC/Suraksha journeys are ported alongside dairy.)
 */
import { useEffect } from "react";
import { useRouter } from "expo-router";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { getToken } from "../lib/api";

export default function Entry() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const token = await getToken();
      router.replace(token ? ("/(tabs)" as any) : ("/login" as any));
    })();
  }, [router]);

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#0f7a4d" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f4f6f5" },
});
