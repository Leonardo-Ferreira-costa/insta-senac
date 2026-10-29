import React, { useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { MainTabParams } from "../../App";
import { useApi } from "../api";
import { MAX_VIDEO_DURATION_MS, validateVideoDuration } from "../media";

type Props = BottomTabScreenProps<MainTabParams, "Publish">;

export function PublishScreen({ navigation }: Props) {
  const { uploadFile } = useApi();
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [caption, setCaption] = useState("");
  const [publishing, setPublishing] = useState(false);
  const mediaType = asset?.type === "video" ? "video" : "image";

  async function selectMedia() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        videoMaxDuration: MAX_VIDEO_DURATION_MS / 1000,
        quality: 1,
      });
      if (result.canceled) return;
      const selectedAsset = result.assets[0];
      const selectedType = selectedAsset.type === "video" ? "video" : "image";
      if (selectedType === "video") {
        const validationError = validateVideoDuration(selectedAsset.duration);
        if (validationError) {
          Alert.alert("Vídeo não permitido", validationError);
          return;
        }
      }
      setAsset(selectedAsset);
    } catch (error) {
      Alert.alert("Não foi possível selecionar a mídia", error instanceof Error ? error.message : "Tente novamente.");
    }
  }

  async function publish() {
    if (!asset) {
      Alert.alert("Selecione uma mídia", "Escolha uma imagem ou um vídeo para publicar.");
      return;
    }
    const durationError = mediaType === "video" ? validateVideoDuration(asset.duration) : null;
    if (durationError) {
      Alert.alert("Vídeo não permitido", durationError);
      return;
    }

    const parameters: Record<string, string> = { caption: caption.trim() };
    if (mediaType === "video") {
      parameters.durationSeconds = String((asset.duration ?? 0) / 1000);
    }

    setPublishing(true);
    try {
      const result = await uploadFile<{ post: { id: string } }>(
        "/posts",
        asset.uri,
        asset.mimeType ?? (mediaType === "video" ? "video/mp4" : "image/jpeg"),
        parameters,
      );
      navigation.navigate("Feed");
    } catch (error) {
      Alert.alert("Não foi possível publicar", error instanceof Error ? error.message : "Tente novamente.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.title}>Nova publicação</Text>
        <Text style={styles.description}>Selecione uma imagem ou vídeo da galeria. O tipo será identificado automaticamente.</Text>
        <Pressable accessibilityRole="button" onPress={selectMedia} style={styles.selectButton}>
          <Text style={styles.selectButtonText}>{asset ? "Escolher outra mídia" : "Selecionar mídia"}</Text>
        </Pressable>

        {asset && (
          <View style={styles.preview}>
            {mediaType === "image" ? (
              <Image source={{ uri: asset.uri }} style={styles.previewImage} resizeMode="cover" />
            ) : (
              <View style={styles.videoPreview}>
                <Text style={styles.videoIcon}>▶</Text>
                <Text style={styles.videoLabel}>Vídeo · {((asset.duration ?? 0) / 1000).toFixed(1)} s</Text>
              </View>
            )}
            <Text numberOfLines={1} style={styles.fileName}>{asset.fileName ?? `Mídia selecionada (${mediaType})`}</Text>
          </View>
        )}

        <Text style={styles.label}>Legenda</Text>
        <TextInput
          style={styles.captionInput}
          value={caption}
          onChangeText={setCaption}
          maxLength={2200}
          multiline
          textAlignVertical="top"
          placeholder="Escreva uma legenda..."
          placeholderTextColor="#a0aabd"
        />
        <Pressable
          style={[styles.publishButton, (!asset || publishing) && styles.disabledButton]}
          onPress={publish}
          disabled={!asset || publishing}
        >
          {publishing ? <ActivityIndicator color="#fff" /> : <Text style={styles.publishButtonText}>Publicar</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f6f8fb" },
  content: { padding: 16 },
  card: { padding: 20, borderWidth: 1, borderColor: "#e7ebf2", borderRadius: 10, backgroundColor: "#fff" },
  title: { color: "#172b4d", fontSize: 20, fontWeight: "700" },
  description: { marginTop: 7, marginBottom: 20, color: "#687994", fontSize: 13, lineHeight: 19 },
  selectButton: { minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#635bff", borderRadius: 6, backgroundColor: "#f1f1ff" },
  selectButtonText: { color: "#5148e5", fontSize: 13, fontWeight: "600" },
  preview: { marginTop: 16, marginBottom: 20 },
  previewImage: { width: "100%", height: 260, borderRadius: 7, backgroundColor: "#edf0f5" },
  videoPreview: { height: 140, alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 7, backgroundColor: "#edf0f5" },
  videoIcon: { color: "#635bff", fontSize: 30 },
  videoLabel: { color: "#52627c", fontSize: 13, fontWeight: "600" },
  fileName: { marginTop: 8, color: "#71809a", fontSize: 11 },
  label: { marginBottom: 7, color: "#344762", fontSize: 12, fontWeight: "600" },
  captionInput: { minHeight: 100, marginBottom: 18, paddingHorizontal: 11, paddingTop: 11, borderWidth: 1, borderColor: "#d9e0ea", borderRadius: 6, color: "#243754", fontSize: 13 },
  publishButton: { minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 6, backgroundColor: "#635bff" },
  disabledButton: { backgroundColor: "#a8a4f5" },
  publishButtonText: { color: "#fff", fontSize: 13, fontWeight: "600" },
});
