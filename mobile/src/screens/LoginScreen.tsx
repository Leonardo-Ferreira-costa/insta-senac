import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParams } from "../../App";
import { useApi } from "../api";

type Props = NativeStackScreenProps<RootStackParams, "Login"> & { onLogin: () => void };
export function LoginScreen({ onLogin }: Props) {
  const { request, setToken } = useApi();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function login() {
    setBusy(true);
    try {
      const result = await request<{ token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await SecureStore.setItemAsync("access_token", result.token);
      setToken(result.token);
      onLogin();
    } catch (error) {
      Alert.alert("Não foi possível entrar", error instanceof Error ? error.message : "Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>I</Text></View>
          <Text style={styles.brand}>insta<Text style={styles.brandLight}>senac</Text></Text>
        </View>
        <Text style={styles.eyebrow}>ÁREA DO ALUNO</Text>
        <Text style={styles.title}>Boas-vindas</Text>
        <Text style={styles.description}>Entre com as credenciais fornecidas pela administração.</Text>
        <Text style={styles.label}>E-mail</Text>
        <TextInput
          style={styles.input}
          placeholder="voce@exemplo.com"
          placeholderTextColor="#a0aabd"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <Text style={styles.label}>Senha</Text>
        <TextInput
          style={styles.input}
          placeholder="Sua senha"
          placeholderTextColor="#a0aabd"
          secureTextEntry
          autoComplete="password"
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={login}
          returnKeyType="go"
        />
        <Pressable
          accessibilityRole="button"
          style={[styles.submit, (busy || !email || !password) && styles.submitDisabled]}
          onPress={login}
          disabled={busy || !email || !password}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Entrar no aplicativo</Text>}
        </Pressable>
        <Text style={styles.footer}>Acesso seguro para alunos Insta Senac</Text>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: "#f6f8fb" },
  card: { padding: 24, borderWidth: 1, borderColor: "#e7ebf2", borderRadius: 12, backgroundColor: "#fff", shadowColor: "#18274b", shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 36 },
  brandMark: { width: 31, height: 31, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#635bff" },
  brandMarkText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  brand: { color: "#172b4d", fontSize: 19, fontWeight: "700", letterSpacing: -0.7 },
  brandLight: { color: "#74819a", fontWeight: "500" },
  eyebrow: { marginBottom: 8, color: "#8794a9", fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  title: { color: "#172b4d", fontSize: 25, fontWeight: "700", letterSpacing: -0.7 },
  description: { marginTop: 6, marginBottom: 25, color: "#687994", fontSize: 13, lineHeight: 19 },
  label: { marginBottom: 7, color: "#344762", fontSize: 12, fontWeight: "600" },
  input: { minHeight: 45, marginBottom: 17, paddingHorizontal: 12, borderWidth: 1, borderColor: "#d9e0ea", borderRadius: 6, color: "#243754", fontSize: 13 },
  submit: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 2, borderRadius: 6, backgroundColor: "#635bff" },
  submitDisabled: { backgroundColor: "#a8a4f5" },
  submitText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  footer: { marginTop: 18, color: "#8794a9", fontSize: 11, textAlign: "center" },
});
