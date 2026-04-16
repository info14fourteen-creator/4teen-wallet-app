import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import {
  Camera,
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from 'expo-camera';

import AppHeader, {
  APP_HEADER_HEIGHT,
  APP_HEADER_TOP_PADDING,
} from '../src/ui/app-header';
import MenuSheet from '../src/ui/menu-sheet';
import SubmenuHeader from '../src/ui/submenu-header';
import { colors, layout, radius, spacing } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { useNotice } from '../src/notice/notice-provider';
import { openInAppBrowser } from '../src/utils/open-in-app-browser';

function isTronAddress(value: string) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value.trim());
}

function looksLikeUrl(value: string) {
  const safe = value.trim().toLowerCase();
  if (!safe) return false;

  return (
    safe.startsWith('http://') ||
    safe.startsWith('https://') ||
    safe.startsWith('www.') ||
    safe.includes('.')
  );
}

function normalizeUrl(value: string) {
  const safe = value.trim();
  if (!safe) return safe;
  if (/^https?:\/\//i.test(safe)) return safe;
  if (safe.startsWith('www.')) return `https://${safe}`;
  if (safe.includes('.')) return `https://${safe}`;
  return safe;
}

type ScanKind = 'address' | 'url' | 'text';
type ScanMode = 'default' | 'send' | 'watch-only' | 'address-book';
type ScanTimeoutStage = 'scan' | 'warn' | 'result';

function detectScanKind(value: string): ScanKind {
  if (isTronAddress(value)) return 'address';
  if (looksLikeUrl(value)) return 'url';
  return 'text';
}

function getScanLabel(kind: ScanKind | null) {
  if (kind === 'address') return 'TRON address';
  if (kind === 'url') return 'URL';
  if (kind === 'text') return 'Text';
  return '';
}

function getPrimaryButtonLabel(kind: ScanKind | null, mode: ScanMode) {
  if (kind === 'address') {
    if (mode === 'watch-only') return 'Import';
    if (mode === 'address-book') return 'Use Address';
    return 'Send';
  }

  if (kind === 'url') return 'Open';
  return 'Use';
}

export default function ScanScreen() {
  const router = useRouter();
  const notice = useNotice();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scannedValue, setScannedValue] = useState('');
  const [scannedType, setScannedType] = useState<ScanKind | null>(null);
  const [timeoutStage, setTimeoutStage] = useState<ScanTimeoutStage>('scan');
  const [timedOut, setTimedOut] = useState(false);
  const [processingImage, setProcessingImage] = useState(false);
  const [scanWindowHeight, setScanWindowHeight] = useState(0);

  const scanLineAnimation = useRef(new Animated.Value(0)).current;
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mode: ScanMode = useMemo(() => {
    const raw = Array.isArray(params.mode) ? params.mode[0] : params.mode;
    if (raw === 'send') return 'send';
    if (raw === 'watch-only') return 'watch-only';
    if (raw === 'address-book') return 'address-book';
    return 'default';
  }, [params.mode]);

  const hasResult = Boolean(scannedValue);

  const scanLabel = useMemo(() => getScanLabel(scannedType), [scannedType]);

  const clearTimers = useCallback(() => {
    if (warnTimerRef.current) {
      clearTimeout(warnTimerRef.current);
      warnTimerRef.current = null;
    }
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    if (resultExitTimerRef.current) {
      clearTimeout(resultExitTimerRef.current);
      resultExitTimerRef.current = null;
    }
  }, []);

  const resetScannerState = useCallback(() => {
    clearTimers();
    setScannedValue('');
    setScannedType(null);
    setTimeoutStage('scan');
    setTimedOut(false);
  }, [clearTimers]);

  useEffect(() => {
    if (hasResult || timedOut) {
      clearTimers();
      return;
    }

    setTimeoutStage('scan');

    warnTimerRef.current = setTimeout(() => {
      setTimeoutStage('warn');
      notice.showNeutralNotice('QR not detected yet.', 1800);
    }, 30000);

    exitTimerRef.current = setTimeout(() => {
      setTimedOut(true);
      notice.showNeutralNotice('QR not found. Returning to previous screen.', 1800);
      setTimeout(() => {
        router.back();
      }, 600);
    }, 45000);

    return () => {
      clearTimers();
    };
  }, [clearTimers, hasResult, notice, router, timedOut]);

  useEffect(() => {
    if (!hasResult) {
      if (resultExitTimerRef.current) {
        clearTimeout(resultExitTimerRef.current);
        resultExitTimerRef.current = null;
      }
      return;
    }

    setTimeoutStage('result');

    resultExitTimerRef.current = setTimeout(() => {
      notice.showNeutralNotice('Scan result expired. Returning back.', 1800);
      router.back();
    }, 60000);

    return () => {
      if (resultExitTimerRef.current) {
        clearTimeout(resultExitTimerRef.current);
        resultExitTimerRef.current = null;
      }
    };
  }, [hasResult, notice, router]);

  useEffect(() => {
    if (hasResult || timedOut) {
      scanLineAnimation.stopAnimation();
      return;
    }

    scanLineAnimation.setValue(0);

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnimation, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.linear),
          useNativeDriver: true,
        }),
        Animated.timing(scanLineAnimation, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.linear),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();

    return () => {
      loop.stop();
      scanLineAnimation.stopAnimation();
    };
  }, [hasResult, scanLineAnimation, timedOut]);

  const handleResolvedValue = useCallback((value: string) => {
    const safe = String(value || '').trim();
    if (!safe) return;
    setScannedType(detectScanKind(safe));
    setScannedValue(safe);
  }, []);

  const handleBarcodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      const value = String(result?.data || '').trim();
      if (!value || hasResult || timedOut) return;
      handleResolvedValue(value);
    },
    [handleResolvedValue, hasResult, timedOut]
  );

  const handleCopy = useCallback(async () => {
    if (!scannedValue) return;
    await Clipboard.setStringAsync(scannedValue);
    notice.showSuccessNotice('Value copied.', 1600);
  }, [notice, scannedValue]);

  const handlePrimaryAction = useCallback(async () => {
    if (!scannedValue) return;

    if (scannedType === 'address') {
      if (mode === 'watch-only') {
        router.push({
          pathname: '/import-watch-only',
          params: {
            address: scannedValue,
          },
        } as any);
        return;
      }

      if (mode === 'address-book') {
        router.push({
          pathname: '/address-book',
          params: {
            openAdd: '1',
            prefillAddress: scannedValue,
          },
        } as any);
        return;
      }

      router.push({
        pathname: '/send',
        params: {
          address: scannedValue,
        },
      } as any);
      return;
    }

    if (scannedType === 'url') {
      await openInAppBrowser(router, normalizeUrl(scannedValue));
      return;
    }

    const safeUrl = normalizeUrl(scannedValue);
    const canOpen = await Linking.canOpenURL(safeUrl).catch(() => false);

    if (canOpen) {
      await openInAppBrowser(router, safeUrl);
      return;
    }

    await Clipboard.setStringAsync(scannedValue);
    notice.showNeutralNotice('Result copied because it cannot be opened here.', 1800);
  }, [mode, notice, router, scannedType, scannedValue]);

  const handleScanAgain = useCallback(() => {
    resetScannerState();
  }, [resetScannerState]);

  const handlePickFromGallery = useCallback(async () => {
    try {
      const mediaPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!mediaPermission.granted) {
        notice.showNeutralNotice('Photo access is required to read QR from gallery.', 1800);
        return;
      }

      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });

      if (picked.canceled || !picked.assets?.[0]?.uri) {
        return;
      }

      setProcessingImage(true);

      const results = await Camera.scanFromURLAsync(picked.assets[0].uri, ['qr']);

      if (!results?.length || !results[0]?.data) {
        notice.showNeutralNotice('No QR code found in selected image.', 2200);
        return;
      }

      handleResolvedValue(results[0].data);
    } catch (error) {
      console.error('Failed to scan image QR:', error);
      notice.showErrorNotice('Failed to process selected image.', 2200);
    } finally {
      setProcessingImage(false);
    }
  }, [handleResolvedValue, notice]);

  if (!permission) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.screen}>
          <View style={styles.headerSlot}>
            <AppHeader onMenuPress={() => setMenuOpen(true)} onScanPress={() => {}} />
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <SubmenuHeader title="SCAN" onBack={() => router.back()} />
            <View style={styles.stubCard}>
              <Text style={styles.stubTitle}>Preparing camera</Text>
              <Text style={styles.stubText}>Checking camera permission status.</Text>
            </View>
          </ScrollView>

          <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.screen}>
          <View style={styles.headerSlot}>
            <AppHeader onMenuPress={() => setMenuOpen(true)} onScanPress={() => {}} />
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <SubmenuHeader title="SCAN" onBack={() => router.back()} />

            <View style={styles.stubCard}>
              <Text style={styles.stubTitle}>Camera access required</Text>
              <Text style={styles.stubText}>
                Allow camera access to scan wallet addresses and QR codes.
              </Text>

              <TouchableOpacity
                activeOpacity={0.9}
                style={[styles.actionButton, styles.primaryButton]}
                onPress={() => void requestPermission()}
              >
                <Text style={styles.primaryButtonText}>Allow Camera</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
        </View>
      </SafeAreaView>
    );
  }

  const scanLineTravel = Math.max(0, scanWindowHeight - 2);

  const scanLineTranslateY = scanLineAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, scanLineTravel],
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        <View style={styles.headerSlot}>
          <AppHeader onMenuPress={() => setMenuOpen(true)} onScanPress={() => {}} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <SubmenuHeader title="SCAN" onBack={() => router.back()} />

          <View style={styles.cameraCard}>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
              onBarcodeScanned={hasResult || timedOut ? undefined : handleBarcodeScanned}
            />

            <View style={styles.overlayRoot} pointerEvents="none">
              <View style={styles.overlayTop} />
              <View style={styles.overlayMiddle}>
                <View style={styles.overlaySide} />

                <View
                  style={styles.scanWindow}
                  onLayout={(event) => {
                    const nextHeight = Math.round(event.nativeEvent.layout.height);
                    if (nextHeight > 0 && nextHeight !== scanWindowHeight) {
                      setScanWindowHeight(nextHeight);
                    }
                  }}
                >
                  <View style={styles.overlayFrame} />

                  {!hasResult && !timedOut ? (
                    <Animated.View
                      style={[
                        styles.scanLine,
                        {
                          transform: [{ translateY: scanLineTranslateY }],
                        },
                      ]}
                    />
                  ) : null}
                </View>

                <View style={styles.overlaySide} />
              </View>
              <View style={styles.overlayBottom} />
            </View>

            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.galleryButton}
              onPress={() => void handlePickFromGallery()}
              disabled={processingImage}
            >
              <Ionicons name="images-outline" size={18} color={colors.white} />
            </TouchableOpacity>

            {hasResult ? (
              <View style={styles.cameraActionsWrap}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={styles.scanAgainButton}
                  onPress={handleScanAgain}
                >
                  <Text style={styles.scanAgainButtonText}>Scan again</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {!hasResult && timeoutStage === 'warn' ? (
              <View style={styles.timeoutNoticeWrap} pointerEvents="none">
                <Text style={styles.timeoutNoticeText}>Nothing found yet</Text>
              </View>
            ) : null}
          </View>

          {hasResult ? (
            <View style={styles.resultCard}>
              <View style={styles.resultTopRow}>
                <Text style={styles.resultLabel}>Scanned result</Text>
                <Text style={styles.resultType}>{scanLabel}</Text>
              </View>

              <Text style={styles.resultValue}>{scannedValue}</Text>

              <View style={styles.actionsColumn}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={[styles.actionButton, styles.primaryButton, styles.fullWidthButton]}
                  onPress={() => void handlePrimaryAction()}
                >
                  <Text style={styles.primaryButtonText}>
                    {getPrimaryButtonLabel(scannedType, mode)}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.9}
                  style={[styles.actionButton, styles.secondaryButton, styles.fullWidthButton]}
                  onPress={() => void handleCopy()}
                >
                  <Text style={styles.secondaryButtonText}>Copy</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </ScrollView>

        <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
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
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: APP_HEADER_TOP_PADDING,
  },

  headerSlot: {
    height: APP_HEADER_HEIGHT,
    justifyContent: 'center',
  },

  scroll: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  content: {
    paddingTop: 14,
    paddingBottom: spacing[7],
    gap: 12,
  },

  cameraCard: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.bg,
  },

  camera: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: colors.bg,
  },

  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },

  overlayTop: {
    flex: 18,
    backgroundColor: 'rgba(0,0,0,0.68)',
  },

  overlayMiddle: {
    flex: 64,
    flexDirection: 'row',
    backgroundColor: 'transparent',
  },

  overlaySide: {
    flex: 18,
    backgroundColor: 'rgba(0,0,0,0.68)',
  },

  scanWindow: {
    flex: 64,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: 'transparent',
    borderRadius: 0,
  },

  overlayBottom: {
    flex: 18,
    backgroundColor: 'rgba(0,0,0,0.68)',
  },

  overlayFrame: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: 'transparent',
  },

  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    opacity: 0.95,
  },

  galleryButton: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  cameraActionsWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 14,
    alignItems: 'center',
  },

  scanAgainButton: {
    minHeight: 36,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,105,0,0.42)',
    backgroundColor: 'rgba(255,105,0,0.08)',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scanAgainButtonText: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
  },

  timeoutNoticeWrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    alignItems: 'center',
  },

  timeoutNoticeText: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    backgroundColor: 'rgba(0,0,0,0.62)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },

  resultCard: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(255,105,0,0.06)',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },

  resultTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  resultLabel: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },

  resultType: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },

  resultValue: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Sora_600SemiBold',
  },

  actionsColumn: {
    gap: 10,
  },

  fullWidthButton: {
    width: '100%',
  },

  actionButton: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },

  primaryButton: {
    backgroundColor: 'rgba(255,105,0,0.14)',
    borderColor: colors.lineStrong,
  },

  secondaryButton: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.lineSoft,
  },

  primaryButtonText: {
    color: colors.accent,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
  },

  secondaryButtonText: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  stubCard: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: 'rgba(255,105,0,0.05)',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
  },

  stubTitle: {
    ...ui.titleSm,
  },

  stubText: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },
});
