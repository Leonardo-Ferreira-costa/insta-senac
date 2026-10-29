import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { BottomTabBar, createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiProvider, useApi } from "./src/api";
import { FeedScreen } from "./src/screens/FeedScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { PostDetailScreen } from "./src/screens/PostDetailScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { EditProfileScreen } from "./src/screens/EditProfileScreen";
import { PublishScreen } from "./src/screens/PublishScreen";
import { UserProfileScreen } from "./src/screens/ProfileScreen";

export type RootStackParams = {
  Login: undefined;
  MainTabs: undefined;
};
export type MainTabParams = {
  Feed: undefined;
  Publish: undefined;
  Profile: undefined;
  EditProfile: undefined;
  PostDetail: { postId: string };
  UserProfile: { userId: string };
};
const Stack = createNativeStackNavigator<RootStackParams>();
const Tabs = createBottomTabNavigator<MainTabParams>();

const tabIcons: Partial<Record<keyof MainTabParams, [string, string]>> = {
  Feed: ["⌂", "Início"],
  Publish: ["+", "Publicar"],
  Profile: ["○", "Perfil"],
};

function AppTabBar(props: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <BottomTabBar
      {...props}
      style={[styles.tabBar, { height: 64 + insets.bottom, paddingBottom: 6 + insets.bottom }]}
    />
  );
}

function MainTabs({ onLogout }: { onLogout: () => Promise<void> }) {
  return (
    <SafeAreaView style={styles.mainTabs} edges={["top"]}>
      <Tabs.Navigator
        backBehavior="history"
        tabBar={(props) => <AppTabBar {...props} />}
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarButton: tabIcons[route.name] ? undefined : () => null,
          tabBarItemStyle: tabIcons[route.name] ? undefined : styles.hiddenTab,
          tabBarLabel: tabIcons[route.name]?.[1] ?? "",
          tabBarActiveTintColor: "#635bff",
          tabBarInactiveTintColor: "#8491a5",
          tabBarLabelStyle: styles.tabLabel,
          tabBarIconStyle: styles.tabIcon,
          tabBarIcon: ({ color, focused }) => (
            tabIcons[route.name] ? (
              <View style={[styles.tabIconWrap, route.name === "Publish" && styles.publishIconWrap]}>
                <Text
                  style={[
                    styles.tabIconText,
                    { color },
                    route.name === "Publish" && styles.publishIconText,
                    focused && styles.tabIconFocused,
                  ]}
                >
                  {tabIcons[route.name]?.[0]}
                </Text>
              </View>
            ) : null
          ),
        })}
      >
        <Tabs.Screen name="Feed">
          {(props) => <FeedScreen {...props} onLogout={onLogout} />}
        </Tabs.Screen>
        <Tabs.Screen name="Publish" component={PublishScreen} />
        <Tabs.Screen name="Profile">
          {(props) => <ProfileScreen {...props} onLogout={onLogout} />}
        </Tabs.Screen>
        <Tabs.Screen name="EditProfile" component={EditProfileScreen} />
        <Tabs.Screen name="PostDetail" component={PostDetailScreen} />
        <Tabs.Screen name="UserProfile" component={UserProfileScreen} />
      </Tabs.Navigator>
    </SafeAreaView>
  );
}

function Navigator() {
  const { setToken } = useApi();
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync("access_token").then((token) => {
      if (token) {
        setToken(token);
        setSignedIn(true);
      }
      setReady(true);
    });
  }, [setToken]);

  if (!ready) return <ActivityIndicator style={styles.loading} />;
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: styles.header,
          headerTintColor: "#5148e5",
          headerTitleStyle: styles.headerTitle,
          headerShadowVisible: false,
          contentStyle: styles.screen,
        }}
      >
        {!signedIn ? (
          <Stack.Screen name="Login" options={{ headerShown: false }}>
            {(props) => <LoginScreen {...props} onLogin={() => setSignedIn(true)} />}
          </Stack.Screen>
        ) : (
          <>
            <Stack.Screen name="MainTabs" options={{ headerShown: false }}>
              {() => (
                <MainTabs
                  onLogout={async () => {
                    await SecureStore.deleteItemAsync("access_token");
                    setToken(null);
                    setSignedIn(false);
                  }}
                />
              )}
            </Stack.Screen>
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ApiProvider>
      <Navigator />
    </ApiProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignSelf: "center" },
  mainTabs: { flex: 1, backgroundColor: "#fff" },
  screen: { backgroundColor: "#f6f8fb" },
  header: { backgroundColor: "#fff" },
  headerTitle: { color: "#172b4d", fontSize: 16, fontWeight: "700" },
  tabBar: {
    paddingTop: 7,
    borderTopColor: "#e6ebf2",
    backgroundColor: "#fff",
    elevation: 0,
  },
  tabLabel: { marginTop: 1, fontSize: 10, fontWeight: "600" },
  tabIcon: { marginTop: 0 },
  tabIconWrap: { minWidth: 28, alignItems: "center" },
  hiddenTab: { display: "none" },
  publishIconWrap: { width: 34, height: 34, justifyContent: "center", borderRadius: 9, backgroundColor: "#635bff" },
  tabIconText: { fontSize: 22, lineHeight: 25 },
  publishIconText: { color: "#fff", fontSize: 27, lineHeight: 31 },
  tabIconFocused: { fontWeight: "700" },
});
