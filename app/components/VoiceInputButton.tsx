/**
 * VoiceInputButton — Reusable 🎤 microphone button for speech-to-text.
 *
 * Place next to any TextInput. Tap to start listening, tap again to stop.
 * Shows pulsing red indicator while recording.
 * Uses device-native Web Speech API — free, no external API.
 *
 * Usage:
 *   <View style={{ flexDirection: "row", alignItems: "center" }}>
 *     <TextInput value={name} onChangeText={setName} style={{ flex: 1 }} />
 *     <VoiceInputButton onResult={setName} language="hi" />
 *   </View>
 */

import React, { useState, useEffect } from "react";
import { TouchableOpacity, Text, StyleSheet, Animated } from "react-native";
import { isVoiceAvailable, startListening, stopListening } from "../lib/voiceInput";

interface Props {
  onResult: (text: string) => void;
  language?: string;
  style?: any;
}

export default function VoiceInputButton({ onResult, language = "en", style }: Props) {
  const [listening, setListening] = useState(false);
  const [available, setAvailable] = useState(false);
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setAvailable(isVoiceAvailable());
  }, []);

  useEffect(() => {
    if (listening) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [listening]);

  if (!available) return null;

  const handlePress = () => {
    if (listening) {
      stopListening();
      setListening(false);
    } else {
      setListening(true);
      startListening(
        language,
        (text) => {
          setListening(false);
          onResult(text);
        },
        () => {
          setListening(false);
        }
      );
    }
  };

  return (
    <Animated.View style={[{ transform: [{ scale: pulseAnim }] }]}>
      <TouchableOpacity
        style={[styles.btn, listening && styles.btnActive, style]}
        onPress={handlePress}
        activeOpacity={0.7}
        hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
      >
        <Text style={styles.icon}>{listening ? "🔴" : "🎤"}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#f5f5f5",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#e0e0e0",
    marginLeft: 8,
  },
  btnActive: {
    backgroundColor: "#fbe9e7",
    borderColor: "#c62828",
  },
  icon: {
    fontSize: 20,
  },
});
