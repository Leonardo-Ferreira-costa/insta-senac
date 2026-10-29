import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type TextInputInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PostComment, useApi } from "../api";

const pageSize = 30;
type Props = {
  postId: string;
  initialCount: number;
  initialComments: PostComment[];
  onClose: () => void;
  onCommentAdded: (comment: PostComment) => void;
};
type CommentsPage = {
  comments: PostComment[];
  total_count: number;
  has_more: boolean;
};

export function CommentsBottomSheet({
  postId,
  initialCount,
  initialComments,
  onClose,
  onCommentAdded,
}: Props) {
  const { request } = useApi();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sheetHeight = windowHeight * 0.9;
  const collapsedY = windowHeight * 0.4;
  const initialCollapsedY = useRef(collapsedY).current;
  const translateY = useRef(new Animated.Value(windowHeight)).current;
  const inputRef = useRef<TextInputInstance | null>(null);
  const pageLoading = useRef(false);
  const [comments, setComments] = useState(initialComments);
  const [totalCount, setTotalCount] = useState(initialCount);
  const [hasMore, setHasMore] = useState(initialCount > initialComments.length);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const loadPage = useCallback(async (before?: PostComment) => {
    const cursor = before
      ? `&beforeCreatedAt=${encodeURIComponent(before.created_at)}&beforeId=${before.id}`
      : "";
    return request<CommentsPage>(`/posts/${postId}/comments?limit=${pageSize}${cursor}`);
  }, [postId, request]);

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: initialCollapsedY,
      duration: 260,
      useNativeDriver: true,
    }).start();
    const focusTimeout = setTimeout(() => inputRef.current?.focus(), 350);
    return () => {
      clearTimeout(focusTimeout);
      Keyboard.dismiss();
    };
  }, [initialCollapsedY, translateY]);

  useEffect(() => {
    let active = true;
    void loadPage().then((page) => {
      if (!active) return;
      setComments(page.comments);
      setTotalCount(page.total_count);
      setHasMore(page.has_more);
    }).catch((error: unknown) => {
      if (active) {
        Alert.alert("Não foi possível carregar os comentários", error instanceof Error ? error.message : "Tente novamente.");
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [loadPage]);

  const snapTo = useCallback((nextExpanded: boolean) => {
    setExpanded(nextExpanded);
    Animated.spring(translateY, {
      toValue: nextExpanded ? 0 : collapsedY,
      useNativeDriver: true,
      damping: 24,
      stiffness: 220,
    }).start();
  }, [collapsedY, translateY]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", () => {
      setKeyboardVisible(true);
      snapTo(true);
    });
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardVisible(false);
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [snapTo]);

  const close = useCallback(() => {
    Keyboard.dismiss();
    Animated.timing(translateY, {
      toValue: windowHeight,
      duration: 200,
      useNativeDriver: true,
    }).start(onClose);
  }, [onClose, translateY, windowHeight]);

  const panStart = useRef(collapsedY);
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 4,
    onMoveShouldSetPanResponderCapture: (_event, gesture) => Math.abs(gesture.dy) > 4,
    onPanResponderGrant: () => {
      panStart.current = expanded ? 0 : collapsedY;
    },
    onPanResponderMove: (_event, gesture) => {
      translateY.setValue(Math.max(0, Math.min(windowHeight, panStart.current + gesture.dy)));
    },
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dy < -70 || gesture.vy < -0.7) {
        snapTo(true);
      } else if (gesture.dy > 120 || gesture.vy > 1.1) {
        if (expanded) snapTo(false);
        else close();
      } else {
        snapTo(expanded);
      }
    },
  }), [collapsedY, close, expanded, snapTo, translateY, windowHeight]);

  const loadMore = useCallback(async () => {
    const lastComment = comments[comments.length - 1];
    if (!hasMore || loading || pageLoading.current || !lastComment) return;
    pageLoading.current = true;
    setLoadingMore(true);
    try {
      const page = await loadPage(lastComment);
      setComments((current) => {
        const ids = new Set(current.map((comment) => comment.id));
        return [...current, ...page.comments.filter((comment) => !ids.has(comment.id))];
      });
      setTotalCount(page.total_count);
      setHasMore(page.has_more);
    } catch (error) {
      Alert.alert("Não foi possível carregar mais comentários", error instanceof Error ? error.message : "Tente novamente.");
    } finally {
      pageLoading.current = false;
      setLoadingMore(false);
    }
  }, [comments, hasMore, loadPage, loading]);

  const sendComment = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const result = await request<{ comment: PostComment }>(`/posts/${postId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setComments((current) => [result.comment, ...current.filter((comment) => comment.id !== result.comment.id)]);
      setTotalCount((count) => count + 1);
      onCommentAdded(result.comment);
      setText("");
      inputRef.current?.focus();
    } catch (error) {
      Alert.alert("Não foi possível enviar o comentário", error instanceof Error ? error.message : "Tente novamente.");
    } finally {
      setSending(false);
    }
  };

  const backdropOpacity = translateY.interpolate({
    inputRange: [0, collapsedY, windowHeight],
    outputRange: [0.45, 0.25, 0],
    extrapolate: "clamp",
  });

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={close}>
      <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.modalContent}>
          <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
            <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Fechar comentários" onPress={close} />
          </Animated.View>
          <Animated.View
            style={[
              styles.sheet,
              {
                height: keyboardVisible ? "100%" : sheetHeight,
                paddingBottom: keyboardVisible ? 8 : Math.max(insets.bottom, 12),
                transform: [{ translateY }],
              },
            ]}
          >
            <View style={styles.header}>
              <View {...panResponder.panHandlers}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={expanded ? "Reduzir gaveta de comentários" : "Expandir gaveta de comentários"}
                  onPress={() => snapTo(!expanded)}
                  style={styles.handleArea}
                >
                  <View style={styles.handle} />
                </Pressable>
              </View>
              <View style={styles.headingRow}>
                <Text style={styles.title}>Comentários</Text>
                <Text style={styles.totalCount}>{totalCount}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Fechar comentários" onPress={close} hitSlop={12} style={styles.closeButton}>
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>
            {loading ? (
              <ActivityIndicator style={styles.loader} color="#635bff" />
            ) : (
              <FlatList
                style={styles.commentsList}
                data={comments}
                keyExtractor={(comment) => comment.id}
                renderItem={({ item }) => (
                  <View style={styles.commentRow}>
                    <Text style={styles.commentText}>
                      <Text style={styles.commentAuthor}>{item.user_name}: </Text>
                      {item.body}
                    </Text>
                  </View>
                )}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                nestedScrollEnabled
                onEndReachedThreshold={0.4}
                onEndReached={() => void loadMore()}
                ListEmptyComponent={<Text style={styles.empty}>Ainda não há comentários. Seja o primeiro!</Text>}
                ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footerLoader} color="#635bff" /> : undefined}
              />
            )}
            <View style={styles.composer}>
              <TextInput
                ref={inputRef}
                accessibilityLabel="Escreva um comentário"
                value={text}
                onChangeText={setText}
                style={styles.input}
                placeholder="Adicione um comentário..."
                placeholderTextColor="#8794a9"
                maxLength={1000}
                multiline
                blurOnSubmit={false}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Enviar comentário"
                onPress={() => void sendComment()}
                disabled={!text.trim() || sending}
                hitSlop={8}
              >
                {sending
                  ? <ActivityIndicator color="#635bff" />
                  : <Text style={[styles.sendButton, !text.trim() && styles.sendDisabled]}>Publicar</Text>}
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalContent: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "#101828" },
  sheet: {
    flexDirection: "column",
    overflow: "hidden",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: "#fff",
  },
  header: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e6ebf2" },
  handleArea: { height: 28, alignItems: "center", justifyContent: "center" },
  handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: "#c5ccda" },
  headingRow: { height: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  title: { color: "#172b4d", fontSize: 15, fontWeight: "700" },
  totalCount: { color: "#71809a", fontSize: 13 },
  closeButton: { position: "absolute", top: 34, right: 18 },
  closeText: { color: "#71809a", fontSize: 27, lineHeight: 30 },
  loader: { flex: 1 },
  commentsList: { flex: 1 },
  listContent: { flexGrow: 1, paddingHorizontal: 18, paddingVertical: 14 },
  commentRow: { paddingVertical: 9 },
  commentText: { color: "#43536d", fontSize: 13, lineHeight: 19 },
  commentAuthor: { color: "#243754", fontWeight: "700" },
  empty: { marginTop: 40, color: "#71809a", fontSize: 13, textAlign: "center" },
  footerLoader: { paddingVertical: 14 },
  composer: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e6ebf2",
  },
  input: { flex: 1, maxHeight: 96, paddingVertical: 10, color: "#243754", fontSize: 13 },
  sendButton: { color: "#635bff", fontSize: 13, fontWeight: "700" },
  sendDisabled: { opacity: 0.4 },
});
