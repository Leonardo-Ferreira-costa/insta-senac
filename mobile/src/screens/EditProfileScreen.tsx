import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { MainTabParams } from "../../App";
import { resolveMediaUrl, User, useApi } from "../api";

type Props = BottomTabScreenProps<MainTabParams, "EditProfile">;
export function EditProfileScreen({ navigation }: Props) {
  const { request, uploadFile } = useApi();
  const [user, setUser] = useState<User | null>(null);
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const previewPhoto = photo?.uri ?? (photoUrl ? resolveMediaUrl(photoUrl) : null);
  useEffect(() => {
    request<{ user: User }>("/users/me").then(({ user: profile }) => {
      setUser(profile);
      setName(profile.name);
      setBio(profile.bio);
      setPhotoUrl(profile.photo_url);
    }).catch((error: unknown) => Alert.alert("Erro", error instanceof Error ? error.message : "Falha ao carregar perfil."))
      .finally(() => setLoading(false));
  }, [request]);

  async function selectPhoto() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (!result.canceled) setPhoto(result.assets[0]);
    } catch (error) {
      Alert.alert("Não foi possível selecionar a foto", error instanceof Error ? error.message : "Tente novamente.");
    }
  }

  async function save() {
    setSaving(true);
    try {
      if (photo) {
        const result = await uploadFile<{ user: User }>(
          "/users/me/profile",
          photo.uri,
          photo.mimeType ?? "image/jpeg",
          { name, bio },
        );
        setUser(result.user);
        setPhotoUrl(result.user.photo_url);
      } else {
        await request("/users/me", {
          method: "PATCH",
          body: JSON.stringify({ name, bio, photoUrl: photoUrl || null }),
        });
      }
      navigation.goBack();
    } catch (error) {
      Alert.alert("Não foi possível salvar", error instanceof Error ? error.message : "Tente novamente.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate("Profile")} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.screenTitle}>Editar perfil</Text>
      </View>
      {loading ? <ActivityIndicator style={styles.loading} color="#635bff" /> : (
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.heading}>Informações pessoais</Text>
            <Text style={styles.description}>Mantenha seu perfil atualizado para que seus colegas possam reconhecer você.</Text>
            <View style={styles.photoSection}>
              {previewPhoto ? (
                <Image source={{ uri: previewPhoto }} style={styles.photoPreview} contentFit="cover" cachePolicy="memory-disk" />
              ) : (
                <View style={[styles.photoPreview, styles.photoPlaceholder]}>
                  <Text style={styles.photoInitial}>{name.slice(0, 1).toUpperCase() || "?"}</Text>
                </View>
              )}
              <Pressable accessibilityRole="button" onPress={selectPhoto} style={styles.photoButton} disabled={saving}>
                <Text style={styles.photoButtonText}>{photo ? "Trocar foto" : "Enviar foto da galeria"}</Text>
              </Pressable>
              {photo && <Text style={styles.photoFileName} numberOfLines={1}>{photo.fileName ?? "Nova foto selecionada"}</Text>}
            </View>
            <Text style={styles.label}>Nome</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} maxLength={120} placeholder="Seu nome" placeholderTextColor="#a0aabd" />
            <Text style={styles.label}>Bio</Text>
            <TextInput style={[styles.input, styles.bio]} value={bio} onChangeText={setBio} multiline maxLength={500} textAlignVertical="top" placeholder="Conte um pouco sobre você" placeholderTextColor="#a0aabd" />
            <Pressable style={[styles.saveButton, (saving || !user) && styles.saveButtonDisabled]} onPress={save} disabled={saving || !user}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Salvar alterações</Text>}
            </Pressable>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  loading: { flex: 1, alignSelf: "center" },
  screen: { flex: 1, backgroundColor: "#f6f8fb" },
  topBar: { height: 58, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e6ebf2", backgroundColor: "#fff" },
  backButton: { minWidth: 24 },
  backText: { color: "#5148e5", fontSize: 30, lineHeight: 32 },
  screenTitle: { color: "#172b4d", fontSize: 16, fontWeight: "700" },
  container: { padding: 16 },
  card: { padding: 20, borderWidth: 1, borderColor: "#e7ebf2", borderRadius: 10, backgroundColor: "#fff" },
  heading: { color: "#243754", fontSize: 16, fontWeight: "700" },
  description: { marginTop: 6, marginBottom: 22, color: "#687994", fontSize: 12, lineHeight: 18 },
  label: { marginBottom: 7, color: "#344762", fontSize: 12, fontWeight: "600" },
  input: { minHeight: 43, marginBottom: 17, paddingHorizontal: 11, borderWidth: 1, borderColor: "#d9e0ea", borderRadius: 6, color: "#243754", fontSize: 13 },
  bio: { minHeight: 90, paddingTop: 11 },
  saveButton: { minHeight: 43, alignItems: "center", justifyContent: "center", marginTop: 5, borderRadius: 6, backgroundColor: "#635bff" },
  saveButtonDisabled: { backgroundColor: "#a8a4f5" },
  saveText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  photoSection: { alignItems: "center", marginBottom: 22 },
  photoPreview: { width: 104, height: 104, borderRadius: 52, backgroundColor: "#e7edf5" },
  photoPlaceholder: { alignItems: "center", justifyContent: "center", backgroundColor: "#e7e7ff" },
  photoInitial: { color: "#5750dc", fontSize: 34, fontWeight: "700" },
  photoButton: { minHeight: 38, justifyContent: "center", marginTop: 10, paddingHorizontal: 14, borderRadius: 6, backgroundColor: "#f1f1ff" },
  photoButtonText: { color: "#5148e5", fontSize: 12, fontWeight: "600" },
  photoFileName: { maxWidth: "100%", marginTop: 6, color: "#71809a", fontSize: 11 },
});
