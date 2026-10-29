import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useFocusEffect } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { MainTabParams } from "../../App";
import { Post, PostComment, resolveMediaUrl, useApi } from "../api";

type Props = BottomTabScreenProps<MainTabParams, "PostDetail">;
export function PostDetailScreen({ route, navigation }: Props) {
  const { request } = useApi();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    setPost(null);
    setComments([]);
    Promise.all([
      request<{ post: Post }>(`/posts/${route.params.postId}`),
      request<{ comments: PostComment[] }>(`/posts/${route.params.postId}/comments`),
    ]).then(([{ post: detail }, { comments: postComments }]) => {
      setPost(detail);
      setComments(postComments);
    }).catch((error: unknown) => Alert.alert("Erro", error instanceof Error ? error.message : "Publicação indisponível."));
  }, [request, route.params.postId]);
  useFocusEffect(useCallback(() => {
    const startedAt = Date.now();
    const sendView = (durationSeconds: number) => request(`/posts/${route.params.postId}/view`, {
      method: "POST",
      body: JSON.stringify({ durationSeconds }),
    }).catch((error: unknown) => Alert.alert("Não foi possível registrar a visualização", error instanceof Error ? error.message : "Tente novamente."));
    void sendView(0);
    return () => {
      const durationSeconds = Math.min(3600, Math.floor((Date.now() - startedAt) / 1000));
      void sendView(durationSeconds);
    };
  }, [request, route.params.postId]));
  const toggleLike = async () => {
    if (!post) return;
    try {
      const result = await request<{ liked_by_me: boolean; like_count: number }>(`/posts/${post.id}/like`, { method: "POST" });
      setPost((current) => current ? { ...current, ...result } : current);
    } catch (error) {
      Alert.alert("Não foi possível curtir", error instanceof Error ? error.message : "Tente novamente.");
    }
  };
  const submitComment = async () => {
    if (!post || !commentText.trim() || submitting) return;
    setSubmitting(true);
    try {
      const result = await request<{ comment: PostComment }>(`/posts/${post.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: commentText }),
      });
      setComments((current) => [...current, result.comment]);
      setCommentText("");
      setPost((current) => current ? { ...current, comment_count: (current.comment_count ?? 0) + 1 } : current);
    } catch (error) {
      Alert.alert("Não foi possível comentar", error instanceof Error ? error.message : "Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Text accessibilityRole="button" onPress={() => navigation.goBack()} style={styles.backButton}>‹</Text>
        <Text style={styles.screenTitle}>Publicação</Text>
      </View>
      {!post
        ? <ActivityIndicator style={styles.loading} color="#635bff" />
        : <PostContent
            post={post}
            comments={comments}
            commentText={commentText}
            submitting={submitting}
            onCommentTextChange={setCommentText}
            onOpenProfile={() => navigation.navigate("UserProfile", { userId: post.user_id })}
            onToggleLike={() => void toggleLike()}
            onSubmitComment={() => void submitComment()}
          />}
    </View>
  );
}

function PostContent({
  post,
  comments,
  commentText,
  submitting,
  onCommentTextChange,
  onOpenProfile,
  onToggleLike,
  onSubmitComment,
}: {
  post: Post;
  comments: PostComment[];
  commentText: string;
  submitting: boolean;
  onCommentTextChange: (value: string) => void;
  onOpenProfile: () => void;
  onToggleLike: () => void;
  onSubmitComment: () => void;
}) {
  const mediaUrl = resolveMediaUrl(post.media_url);
  const player = useVideoPlayer(post.media_type === "video" ? { uri: mediaUrl, useCaching: true } : null);
  return (
    <ScrollView>
      <View style={styles.card}>
        <View style={styles.authorRow}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{post.user_name?.slice(0, 1).toUpperCase() ?? "A"}</Text></View>
          <Text accessibilityRole="button" onPress={onOpenProfile} style={styles.author}>{post.user_name}</Text>
        </View>
        {post.media_type === "image" ? (
          <Image source={{ uri: mediaUrl }} style={styles.media} contentFit="contain" cachePolicy="memory-disk" />
        ) : <VideoView player={player} style={styles.media} nativeControls contentFit="contain" />}
        {!!post.caption && <Text style={styles.caption}>{post.caption}</Text>}
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={post.liked_by_me ? "Remover curtida" : "Curtir publicação"}
            onPress={onToggleLike}
            style={styles.actionButton}
          >
            <Text style={[styles.heart, post.liked_by_me && styles.heartLiked]}>{post.liked_by_me ? "♥" : "♡"}</Text>
            <Text style={styles.actionCount}>{post.like_count ?? 0}</Text>
          </Pressable>
          <View style={styles.actionButton}>
            <Text style={styles.commentIcon}>▱</Text>
            <Text style={styles.actionCount}>{post.comment_count ?? comments.length}</Text>
          </View>
        </View>
        <View style={styles.comments}>
          <Text style={styles.commentsHeading}>Comentários</Text>
          {comments.map((comment) => (
            <View key={comment.id} style={styles.comment}>
              <Text style={styles.commentAuthor}>{comment.user_name}</Text>
              <Text style={styles.commentBody}>{comment.body}</Text>
            </View>
          ))}
          <View style={styles.commentComposer}>
            <TextInput
              accessibilityLabel="Escreva um comentário"
              style={styles.commentInput}
              value={commentText}
              onChangeText={onCommentTextChange}
              maxLength={1000}
              placeholder="Adicione um comentário..."
              placeholderTextColor="#8794a9"
              multiline
            />
            <Pressable accessibilityRole="button" onPress={onSubmitComment} disabled={!commentText.trim() || submitting}>
              <Text style={[styles.sendComment, (!commentText.trim() || submitting) && styles.sendDisabled]}>
                {submitting ? "..." : "Enviar"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  loading: { flex: 1, alignSelf: "center" },
  screen: { flex: 1, backgroundColor: "#f6f8fb" },
  topBar: { height: 52, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e6ebf2", backgroundColor: "#fff" },
  backButton: { color: "#5148e5", fontSize: 30, lineHeight: 32 },
  screenTitle: { color: "#172b4d", fontSize: 16, fontWeight: "700" },
  card: { overflow: "hidden", margin: 12, borderWidth: 1, borderColor: "#e7ebf2", borderRadius: 10, backgroundColor: "#fff" },
  authorRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14 },
  avatar: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: "#e7e7ff" },
  avatarText: { color: "#5750dc", fontSize: 13, fontWeight: "700" },
  author: { color: "#243754", fontSize: 12, fontWeight: "700" },
  media: { width: "100%", height: 440, backgroundColor: "#edf0f5" },
  caption: { paddingHorizontal: 14, paddingVertical: 13, color: "#43536d", fontSize: 13, lineHeight: 19 },
  actions: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 20, paddingHorizontal: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#edf0f5" },
  actionButton: { flexDirection: "row", alignItems: "center", gap: 6 },
  heart: { color: "#354661", fontSize: 27, lineHeight: 31 },
  heartLiked: { color: "#e44565" },
  commentIcon: { color: "#354661", fontSize: 23, lineHeight: 28 },
  actionCount: { color: "#43536d", fontSize: 12, fontWeight: "600" },
  comments: { paddingHorizontal: 14, paddingBottom: 14 },
  commentsHeading: { marginTop: 3, marginBottom: 10, color: "#243754", fontSize: 13, fontWeight: "700" },
  comment: { marginBottom: 9 },
  commentAuthor: { color: "#243754", fontSize: 12, fontWeight: "700" },
  commentBody: { marginTop: 2, color: "#52627c", fontSize: 12, lineHeight: 18 },
  commentComposer: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 7, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#edf0f5" },
  commentInput: { flex: 1, maxHeight: 100, paddingVertical: 7, color: "#243754", fontSize: 12 },
  sendComment: { color: "#635bff", fontSize: 12, fontWeight: "700" },
  sendDisabled: { opacity: 0.45 },
});
