import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Linking,
  SafeAreaView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';

import { colors, radius } from '../src/theme/tokens';

import {
  BrowserBackIcon,
  BrowserCloseIcon,
  BrowserForwardIcon,
  BrowserRefreshIcon,
  BrowserShareIcon,
} from '../src/ui/ui-icons';

const DEFAULT_URL = 'https://tronscan.org';

function normalizeUrl(input?: string | string[]) {
  const raw = Array.isArray(input) ? input[0] : input;

  if (!raw || typeof raw !== 'string') {
    return DEFAULT_URL;
  }

  const trimmed = raw.trim();

  if (!trimmed) {
    return DEFAULT_URL;
  }

  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:') ||
    trimmed.startsWith('sms:') ||
    trimmed.startsWith('tronlinkoutside://') ||
    trimmed.startsWith('intent://')
  ) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function shouldOpenExternally(url: string) {
  return (
    url.startsWith('mailto:') ||
    url.startsWith('tel:') ||
    url.startsWith('sms:') ||
    url.startsWith('tronlinkoutside://') ||
    url.startsWith('intent://')
  );
}

function getReadableDomain(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0] || 'browser';
  }
}

function getReadableTitle(title: string) {
  const trimmed = title.trim();
  return trimmed || ' ';
}

export default function BrowserScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ url?: string | string[] }>();
  const webViewRef = useRef<WebView>(null);
  const inputRef = useRef<TextInput>(null);

  const initialUrl = useMemo(() => normalizeUrl(params.url), [params.url]);

  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const [draftUrl, setDraftUrl] = useState(initialUrl);
  const [pageTitle, setPageTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0.08);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [editingUrl, setEditingUrl] = useState(false);

  const domainLabel = useMemo(() => getReadableDomain(currentUrl), [currentUrl]);
  const titleLabel = useMemo(() => getReadableTitle(pageTitle), [pageTitle]);

  const closeScreen = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/wallet');
  }, [router]);

  const handleBackPress = useCallback(() => {
    if (canGoBack) {
      webViewRef.current?.goBack();
      return;
    }

    closeScreen();
  }, [canGoBack, closeScreen]);

  const handleShare = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(currentUrl);
      await Share.share({
        message: currentUrl,
        url: currentUrl,
      });
    } catch (error) {
      console.error('Failed to share link:', error);
    }
  }, [currentUrl]);

  const submitUrl = useCallback(() => {
    const normalized = normalizeUrl(draftUrl);

    Keyboard.dismiss();
    setEditingUrl(false);
    setLoading(true);
    setHasLoadedOnce(false);
    setLoadProgress(0.08);
    setCurrentUrl(normalized);
    setDraftUrl(normalized);
  }, [draftUrl]);

  const cancelEditing = useCallback(() => {
    Keyboard.dismiss();
    setDraftUrl(currentUrl);
    setEditingUrl(false);
  }, [currentUrl]);

  const handleStartEditing = useCallback(() => {
    if (editingUrl) return;

    setDraftUrl(currentUrl);
    setEditingUrl(true);

    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [currentUrl, editingUrl]);

  const handleShouldStartLoadWithRequest = useCallback((request: any) => {
    const nextUrl = request?.url;

    if (!nextUrl || typeof nextUrl !== 'string') {
      return false;
    }

    if (shouldOpenExternally(nextUrl)) {
      void Linking.openURL(nextUrl).catch((error) => {
        console.error('Failed to open external deep link:', error);
      });
      return false;
    }

    if (
      nextUrl.startsWith('http://') ||
      nextUrl.startsWith('https://') ||
      nextUrl.startsWith('about:blank')
    ) {
      return true;
    }

    void Linking.openURL(nextUrl).catch((error) => {
      console.error('Failed to open unsupported scheme:', error);
    });

    return false;
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.headerIconButton}
              onPress={closeScreen}
            >
              <BrowserCloseIcon width={20} height={20} />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.addressCard, editingUrl && styles.addressCardEditing]}
              onPress={handleStartEditing}
            >
              {editingUrl ? (
                <TextInput
                  ref={inputRef}
                  value={draftUrl}
                  onChangeText={setDraftUrl}
                  onSubmitEditing={submitUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  returnKeyType="go"
                  blurOnSubmit
                  placeholder="Enter URL"
                  placeholderTextColor={colors.textDim}
                  style={styles.addressInput}
                />
              ) : (
                <View style={styles.addressReadOnly}>
                  <Text style={styles.domainText} numberOfLines={1}>
                    {domainLabel}
                  </Text>
                  <Text style={styles.titleText} numberOfLines={1}>
                    {titleLabel}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.headerIconButton}
              onPress={() => {
                setLoading(true);
                setHasLoadedOnce(false);
                setLoadProgress(0.08);
                webViewRef.current?.reload();
              }}
            >
              <BrowserRefreshIcon width={20} height={20} />
            </TouchableOpacity>
          </View>

          {editingUrl ? (
            <View style={styles.editActionsWrap}>
              <View style={styles.editActionsRow}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={[styles.editActionButton, styles.editCancelButton]}
                  onPress={cancelEditing}
                >
                  <Text style={styles.editCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.9}
                  style={[styles.editActionButton, styles.editGoButton]}
                  onPress={submitUrl}
                >
                  <Text style={styles.editGoText}>Go</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.max(8, Math.min(loadProgress * 100, 100))}%`,
                  opacity: loading ? 1 : 0,
                },
              ]}
            />
          </View>
        </View>

        <View style={styles.webviewWrap}>
          <WebView
            ref={webViewRef}
            source={{ uri: currentUrl }}
            style={[styles.webview, !hasLoadedOnce && styles.webviewHidden]}
            containerStyle={styles.webviewContainer}
            onLoadStart={() => {
              setLoading(true);
              setHasLoadedOnce(false);
              setLoadProgress(0.12);
            }}
            onLoadProgress={({ nativeEvent }) => {
              const progress =
                typeof nativeEvent.progress === 'number' ? nativeEvent.progress : 0.12;
              setLoadProgress(progress);
            }}
            onLoadEnd={() => {
              setLoading(false);
              setHasLoadedOnce(true);
              setLoadProgress(1);
            }}
            onNavigationStateChange={(state) => {
              setCurrentUrl(state.url);
              setDraftUrl(state.url);
              setPageTitle(state.title || '');
              setCanGoBack(state.canGoBack);
              setCanGoForward(state.canGoForward);
            }}
            onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
            sharedCookiesEnabled
            javaScriptEnabled
            domStorageEnabled
            allowsBackForwardNavigationGestures
            setSupportMultipleWindows={false}
            startInLoadingState={false}
          />

          {!hasLoadedOnce ? (
            <View style={styles.fullscreenLoader}>
              <ActivityIndicator color={colors.accent} size="small" />
            </View>
          ) : null}
        </View>

        <View style={styles.bottomBar}>
          <View style={styles.bottomLeftGroup}>
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.bottomAction}
              onPress={handleBackPress}
            >
              <BrowserBackIcon width={20} height={20} />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.bottomAction, !canGoForward && styles.bottomActionDisabled]}
              onPress={() => webViewRef.current?.goForward()}
              disabled={!canGoForward}
            >
              <BrowserForwardIcon width={20} height={20} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.bottomAction}
            onPress={() => void handleShare()}
          >
            <BrowserShareIcon width={20} height={20} />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: colors.bg,
  },

  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  headerIconButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  addressCard: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSoft,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },

  addressCardEditing: {
    backgroundColor: 'rgba(255,105,0,0.09)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 4,
  },

  addressReadOnly: {
    gap: 2,
  },

  domainText: {
    color: colors.white,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
  },

  titleText: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_600SemiBold',
  },

  addressInput: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 18,
    paddingVertical: 0,
    fontFamily: 'Sora_600SemiBold',
  },

  editActionsWrap: {
    alignItems: 'center',
    marginTop: 10,
  },

  editActionsRow: {
    width: '100%',
    maxWidth: 420,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },

  editActionButton: {
    flex: 1,
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },

  editCancelButton: {
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
  },

  editGoButton: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(255,105,0,0.12)',
  },

  editCancelText: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
  },

  editGoText: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
  },

  progressTrack: {
    height: 2,
    marginTop: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.accent,
  },

  webviewWrap: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#000000',
  },

  webviewContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },

  webview: {
    flex: 1,
    backgroundColor: '#000000',
  },

  webviewHidden: {
    opacity: 0,
  },

  fullscreenLoader: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },

  bottomBar: {
    minHeight: 74,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
    backgroundColor: colors.bg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  bottomLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  bottomAction: {
    width: 58,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },

  bottomActionDisabled: {
    opacity: 0.4,
  },
});
