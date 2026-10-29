import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View, type ImageStyle } from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useFocusEffect } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { MainTabParams } from "../../App";
import { CommentsBottomSheet } from "../components/CommentsBottomSheet";
import { Post, PostComment, resolveMediaUrl, useApi } from "../api";

const mediaImageStyle: ImageStyle = { width: "100%", height: 360, backgroundColor: "#edf0f5" };

type Props = BottomTabScreenProps<MainTabParams, "Feed"> & {
  onLogout: () => void;
};

function FeedPost({
  post,
  onOpenPost,
  onOpenProfile,
  onToggleLike,
  onOpenComments,
}: {
  post: Post;
  onOpenPost: () => void;
  onOpenProfile: () => void;
  onToggleLike: () => void;
  onOpenComments: () => void;
}) {
  const mediaUrl = resolveMediaUrl(post.media_url);
  const player = useVideoPlayer(post.media_type === "video" ? { uri: mediaUrl, useCaching: true } : null);
  return (
    <View style={styles.postCard}>
      <View style={styles.postHeader}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{post.user_name?.slice(0, 1).toUpperCase() ?? "A"}</Text></View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Ver perfil de ${post.user_name}`}
          style={styles.authorInfo}
          onPress={onOpenProfile}
        >
          <Text style={styles.author}>{post.user_name}</Text>
          <Text style={styles.postMeta}>Insta Senac</Text>
        </Pressable>
        <Text style={styles.more}>•••</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Abrir publicação" onPress={onOpenPost}>
        {post.media_type === "image" ? (
          <Image source={{ uri: mediaUrl }} style={mediaImageStyle} contentFit="cover" cachePolicy="memory-disk" />
        ) : (
          <VideoView player={player} style={styles.media} nativeControls contentFit="contain" />
        )}
      </Pressable>
      {!!post.caption && (
        <Pressable accessibilityRole="button" accessibilityLabel="Abrir publicação" onPress={onOpenPost}>
          <Text style={styles.caption}>{post.caption}</Text>
        </Pressable>
      )}
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={post.liked_by_me ? "Remover curtida" : "Curtir publicação"}
          onPress={onToggleLike}
          style={styles.likeButton}
        >
          <Text style={[styles.heart, post.liked_by_me && styles.heartLiked]}>{post.liked_by_me ? "♥" : "♡"}</Text>
          <Text style={styles.actionCount}>{post.like_count ?? 0}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Ver comentários" onPress={onOpenComments} style={styles.commentButton}>
          <Text style={styles.commentIcon}>▱</Text>
          <Text style={styles.actionCount}>{post.comment_count ?? 0}</Text>
        </Pressable>
      </View>
      {!!post.comments_preview?.length && (
        <View style={styles.commentPreview}>
          {post.comments_preview.slice(0, 3).map((comment) => (
            <Text key={comment.id} numberOfLines={2} style={styles.previewLine}>
              <Text style={styles.previewAuthor}>{comment.user_name}: </Text>
              {comment.body}
            </Text>
          ))}
        </View>
      )}
      <Pressable accessibilityRole="button" onPress={onOpenComments} style={styles.allCommentsButton}>
        <Text style={styles.allCommentsText}>Ver todos os {post.comment_count ?? 0} comentários</Text>
      </Pressable>
    </View>
  );
}

export function FeedScreen({ navigation, onLogout }: Props) {
  const { request } = useApi();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const [activeCommentsPost, setActiveCommentsPost] = useState<Post | null>(null);
  const loadFeed = useCallback(async () => {
    try {
      const result = await request<{ posts: Post[] }>("/feed?limit=20");
      setPosts(result.posts);
      setHasMore(result.posts.length === 20);
    } catch (error) {
      Alert.alert("Erro ao carregar feed", error instanceof Error ? error.message : "Tente novamente.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [request]);
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMoreRef.current || loading || refreshing) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const exclude = posts.map((post) => post.id).join(",");
      const result = await request<{ posts: Post[] }>(`/feed?limit=20&exclude=${exclude}`);
      setPosts((current) => [...current, ...result.posts]);
      setHasMore(result.posts.length === 20);
    } catch (error) {
      Alert.alert("Erro ao carregar mais publicações", error instanceof Error ? error.message : "Tente novamente.");
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, loading, posts, refreshing, request]);
  const toggleLike = useCallback(async (postId: string) => {
    try {
      const result = await request<{ liked_by_me: boolean; like_count: number }>(`/posts/${postId}/like`, { method: "POST" });
      setPosts((current) => current.map((post) => post.id === postId ? { ...post, ...result } : post));
    } catch (error) {
      Alert.alert("Não foi possível curtir", error instanceof Error ? error.message : "Tente novamente.");
    }
  }, [request]);
  const addCommentToFeed = useCallback((postId: string, comment: PostComment) => {
    setPosts((current) => current.map((post) => {
      if (post.id !== postId) return post;
      const currentPreview = post.comments_preview ?? [];
      return {
        ...post,
        comment_count: (post.comment_count ?? 0) + 1,
        comments_preview: [comment, ...currentPreview.filter((item) => item.id !== comment.id)].slice(0, 3),
      };
    }));
    setActiveCommentsPost((current) => current?.id === postId
      ? {
          ...current,
          comment_count: (current.comment_count ?? 0) + 1,
          comments_preview: [comment, ...(current.comments_preview ?? []).filter((item) => item.id !== comment.id)].slice(0, 3),
        }
      : current);
  }, []);
  useFocusEffect(useCallback(() => {
    void loadFeed();
  }, [loadFeed]));
  const refresh = () => {
    setRefreshing(true);
    setHasMore(true);
    void loadFeed();
  };
  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>I</Text></View>
          <Text style={styles.brand}>insta<Text style={styles.brandLight}>senac</Text></Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Sair" onPress={onLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Sair</Text>
        </Pressable>
      </View>
      {loading ? <ActivityIndicator style={styles.spinner} /> : (
        <FlatList
          data={posts}
          keyExtractor={(post) => post.id}
          renderItem={({ item }) => (
            <FeedPost
              post={item}
              onOpenPost={() => navigation.navigate("PostDetail", { postId: item.id })}
              onOpenProfile={() => navigation.navigate("UserProfile", { userId: item.user_id })}
              onToggleLike={() => void toggleLike(item.id)}
              onOpenComments={() => setActiveCommentsPost(item)}
            />
          )}
          contentContainerStyle={styles.feedContent}
          ListEmptyComponent={<Text style={styles.empty}>Não há publicações disponíveis.</Text>}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          onEndReachedThreshold={0.5}
          onEndReached={() => void loadMore()}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.loadMore} color="#635bff" /> : undefined}
        />
      )}
      {activeCommentsPost && (
        <CommentsBottomSheet
          postId={activeCommentsPost.id}
          initialCount={activeCommentsPost.comment_count ?? 0}
          initialComments={activeCommentsPost.comments_preview ?? []}
          onClose={() => setActiveCommentsPost(null)}
          onCommentAdded={(comment) => addCommentToFeed(activeCommentsPost.id, comment)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f6f8fb" },
  topBar: {
    height: 58,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e6ebf2",
    backgroundColor: "#fff",
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandMark: { width: 29, height: 29, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#635bff" },
  brandMarkText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  brand: { color: "#172b4d", fontSize: 18, fontWeight: "700", letterSpacing: -0.6 },
  brandLight: { color: "#74819a", fontWeight: "500" },
  logoutButton: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 7, backgroundColor: "#f1f1ff" },
  logoutText: { color: "#635bff", fontSize: 12, fontWeight: "600" },
  feedContent: { paddingTop: 12, paddingBottom: 18 },
  spinner: { flex: 1 },
  postCard: {
    overflow: "hidden",
    marginHorizontal: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e7ebf2",
    borderRadius: 10,
    backgroundColor: "#fff",
    shadowColor: "#18274b",
    shadowOpacity: 0.035,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  postHeader: { minHeight: 58, flexDirection: "row", alignItems: "center", paddingHorizontal: 13, gap: 10 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#e7e7ff" },
  avatarText: { color: "#5750dc", fontSize: 13, fontWeight: "700" },
  authorInfo: { flex: 1, gap: 2 },
  author: { color: "#243754", fontSize: 12, fontWeight: "700" },
  postMeta: { color: "#8794a9", fontSize: 10 },
  more: { color: "#8794a9", fontSize: 15, letterSpacing: 1 },
  media: { width: "100%", height: 360, backgroundColor: "#edf0f5" },
  caption: { paddingHorizontal: 14, paddingVertical: 13, color: "#43536d", fontSize: 13, lineHeight: 19 },
  actions: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 20, paddingHorizontal: 13, paddingBottom: 5 },
  likeButton: { flexDirection: "row", alignItems: "center", gap: 5 },
  heart: { color: "#354661", fontSize: 27, lineHeight: 31 },
  heartLiked: { color: "#e44565" },
  commentButton: { flexDirection: "row", alignItems: "center", gap: 6 },
  commentIcon: { color: "#354661", fontSize: 23, lineHeight: 28 },
  actionCount: { color: "#43536d", fontSize: 12, fontWeight: "600" },
  commentPreview: { gap: 4, paddingHorizontal: 14, paddingTop: 2 },
  previewLine: { color: "#52627c", fontSize: 12, lineHeight: 17 },
  previewAuthor: { color: "#243754", fontWeight: "700" },
  allCommentsButton: { alignSelf: "flex-start", paddingHorizontal: 14, paddingTop: 5, paddingBottom: 11 },
  allCommentsText: { color: "#8794a9", fontSize: 12 },
  loadMore: { paddingVertical: 16 },
  empty: { marginTop: 50, paddingHorizontal: 32, color: "#71809a", fontSize: 13, textAlign: "center" },
});
