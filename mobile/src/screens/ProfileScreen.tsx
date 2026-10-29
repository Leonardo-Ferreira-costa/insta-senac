import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View, type ImageStyle } from "react-native";
import { Image } from "expo-image";
import { useFocusEffect } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { MainTabParams } from "../../App";
import { Post, resolveMediaUrl, User, useApi } from "../api";

const avatarImageStyle: ImageStyle = { width: 82, height: 82, borderRadius: 41 };
const thumbnailImageStyle: ImageStyle = { width: "100%", height: "100%" };

type ProfileProps = BottomTabScreenProps<MainTabParams, "Profile"> & { onLogout: () => void };
type UserProfileProps = BottomTabScreenProps<MainTabParams, "UserProfile">;
type ProfileData = Pick<User, "id" | "name" | "bio" | "photo_url" | "category"> & Partial<Pick<User, "email">>;
type ProfileCallbacks = {
  ownProfile: boolean;
  onEditProfile?: () => void;
  onBack?: () => void;
  onOpenPost: (postId: string) => void;
  onLogout?: () => void;
  userId?: string;
};

export function ProfileScreen({ navigation, onLogout }: ProfileProps) {
  return (
    <ProfileContent
      ownProfile
      onEditProfile={() => navigation.navigate("EditProfile")}
      onOpenPost={(postId) => navigation.navigate("PostDetail", { postId })}
      onLogout={onLogout}
    />
  );
}

export function UserProfileScreen({ route, navigation }: UserProfileProps) {
  return (
    <ProfileContent
      ownProfile={false}
      userId={route.params.userId}
      onBack={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate("Feed")}
      onOpenPost={(postId) => navigation.navigate("PostDetail", { postId })}
    />
  );
}

function ProfileContent({ ownProfile, userId, onEditProfile, onBack, onOpenPost, onLogout }: ProfileCallbacks) {
  const { request } = useApi();
  const [user, setUser] = useState<ProfileData | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try {
      const endpoint = ownProfile ? "/users/me" : `/users/${userId}/profile`;
      const profile = await request<{ user: ProfileData }>(endpoint);
      const ownPosts = await request<{ posts: Post[] }>(`/users/${profile.user.id}/posts`);
      setUser(profile.user);
      setPosts(ownPosts.posts);
    } catch (error) {
      Alert.alert("Erro ao carregar perfil", error instanceof Error ? error.message : "Tente novamente.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [ownProfile, request, userId]);
  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));
  if (loading && !user) return <ActivityIndicator style={styles.loading} color="#635bff" />;
  if (!user) return <Text style={styles.unavailable}>Perfil indisponível.</Text>;
  return (
    <View style={styles.screen}>
      {ownProfile && (
        <View style={styles.topBar}>
          <Text style={styles.screenTitle}>Meu perfil</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Sair" onPress={onLogout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Sair</Text>
          </Pressable>
        </View>
      )}
      {!ownProfile && (
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={onBack} style={styles.backButton}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <Text style={styles.screenTitle}>Perfil</Text>
        </View>
      )}
      <FlatList
        data={posts}
        numColumns={3}
        keyExtractor={(post) => post.id}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.profileCard}>
            {user.photo_url ? (
              <Image source={{ uri: resolveMediaUrl(user.photo_url) }} style={avatarImageStyle} cachePolicy="memory-disk" />
            ) : <View style={[styles.avatar, styles.avatarPlaceholder]}><Text style={styles.avatarInitial}>{user.name.slice(0, 1).toUpperCase()}</Text></View>}
            <Text style={styles.name}>{user.name}</Text>
            {!!user.email && <Text style={styles.email}>{user.email}</Text>}
            {!!user.bio && <Text style={styles.bio}>{user.bio}</Text>}
            <View style={styles.categoryBadge}><Text style={styles.category}>{user.category}</Text></View>
            <View style={styles.stats}><Text style={styles.statsValue}>{posts.length}</Text><Text style={styles.statsLabel}>publicações</Text></View>
            {ownProfile && (
              <Pressable style={styles.editButton} onPress={onEditProfile}>
                <Text style={styles.editButtonText}>Editar perfil</Text>
              </Pressable>
            )}
            <View style={styles.postsHeading}><Text style={styles.postsTitle}>Publicações</Text></View>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Abrir publicação${item.caption ? `: ${item.caption}` : ""}`}
            style={styles.thumbnailCell}
            onPress={() => onOpenPost(item.id)}
          >
            {item.media_type === "image" ? (
              <Image
                source={{ uri: resolveMediaUrl(item.media_url) }}
                style={thumbnailImageStyle}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={item.id}
              />
            ) : (
              <View style={styles.videoThumbnail}>
                <Text style={styles.videoThumbnailIcon}>▶</Text>
              </View>
            )}
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.empty}>{ownProfile ? "Você ainda não tem publicações." : "Este usuário ainda não tem publicações."}</Text>}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor="#635bff" />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignSelf: "center" },
  unavailable: { padding: 24, color: "#71809a", textAlign: "center" },
  screen: { flex: 1, backgroundColor: "#f6f8fb" },
  topBar: { height: 58, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e6ebf2", backgroundColor: "#fff" },
  screenTitle: { color: "#172b4d", fontSize: 16, fontWeight: "700" },
  backButton: { minWidth: 32 },
  backText: { color: "#5148e5", fontSize: 30, lineHeight: 32 },
  logoutButton: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 7, backgroundColor: "#f1f1ff" },
  logoutText: { color: "#635bff", fontSize: 12, fontWeight: "600" },
  listContent: { paddingBottom: 16 },
  profileCard: { alignItems: "center", margin: 12, marginBottom: 0, padding: 22, borderWidth: 1, borderColor: "#e7ebf2", borderRadius: 10, backgroundColor: "#fff" },
  avatar: { width: 82, height: 82, borderRadius: 41 },
  avatarPlaceholder: { alignItems: "center", justifyContent: "center", backgroundColor: "#e7e7ff" },
  avatarInitial: { color: "#5750dc", fontSize: 28, fontWeight: "700" },
  name: { marginTop: 13, color: "#172b4d", fontSize: 19, fontWeight: "700", letterSpacing: -0.4 },
  email: { marginTop: 4, color: "#8794a9", fontSize: 12 },
  bio: { marginTop: 12, color: "#52627c", fontSize: 13, textAlign: "center", lineHeight: 19 },
  categoryBadge: { marginTop: 12, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: "#e7eaf0", borderRadius: 18, backgroundColor: "#fafbfc" },
  category: { color: "#5a6a82", fontSize: 11 },
  stats: { flexDirection: "row", alignItems: "baseline", gap: 5, marginTop: 15 },
  statsValue: { color: "#243754", fontSize: 17, fontWeight: "700" },
  statsLabel: { color: "#71809a", fontSize: 11 },
  editButton: { minHeight: 38, alignSelf: "stretch", alignItems: "center", justifyContent: "center", marginTop: 17, borderRadius: 6, backgroundColor: "#635bff" },
  editButtonText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  postsHeading: { alignSelf: "stretch", marginTop: 22, paddingTop: 15, borderTopWidth: 1, borderTopColor: "#edf0f5" },
  postsTitle: { color: "#243754", fontSize: 13, fontWeight: "700" },
  gridRow: { justifyContent: "flex-start" },
  thumbnailCell: { width: "33.3333%", flexGrow: 0, flexShrink: 0, aspectRatio: 1, padding: 1, backgroundColor: "#f6f8fb" },
  videoThumbnail: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#dfe4ef" },
  videoThumbnailIcon: { color: "#635bff", fontSize: 25 },
  empty: { padding: 24, color: "#71809a", fontSize: 12, textAlign: "center" },
});
