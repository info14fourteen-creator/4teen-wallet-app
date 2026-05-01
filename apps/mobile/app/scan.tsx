import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import {
  Camera,
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from 'expo-camera';

import { useNavigationInsets } from '../src/ui/navigation';
import ScreenBrow from '../src/ui/screen-brow';
import LottieIcon from '../src/ui/lottie-icon';

import { colors, layout, radius } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { useNotice } from '../src/notice/notice-provider';
import { translateNow, useI18n } from '../src/i18n';
import { openInAppBrowser } from '../src/utils/open-in-app-browser';
import { goBackOrReplace } from '../src/ui/safe-back';

const scanGallerySource = require('../assets/icons/scan/scan_gallery.json');

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
  if (kind === 'address') return translateNow('TRON address');
  if (kind === 'url') return translateNow('URL');
  if (kind === 'text') return translateNow('Text');
  return '';
}

function getPrimaryButtonLabel(kind: ScanKind | null, mode: ScanMode) {
  if (kind === 'address') {
    if (mode === 'watch-only') return translateNow('Import');
    if (mode === 'address-book') return translateNow('Use Address');
    return translateNow('Send');
  }

  if (kind === 'url') return translateNow('Open');
  return translateNow('Use');
}

export default function ScanScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const isFocused = useIsFocused();
  const notice = useNotice();
  const params = useLocalSearchParams<{
    mode?: string;
    tokenId?: string | string[];
    contactName?: string | string[];
  }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [scannedValue, setScannedValue] = useState('');
  const [scannedType, setScannedType] = useState<ScanKind | null>(null);
  const [timeoutStage, setTimeoutStage] = useState<ScanTimeoutStage>('scan');
  const [timedOut, setTimedOut] = useState(false);
  const [processingImage, setProcessingImage] = useState(false);
  const [scanWindowHeight, setScanWindowHeight] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);

  const navInsets = useNavigationInsets({
    topExtra: 14,
    bottomExtra: 20,
  });

  const scanLineAnimation = useRef(new Animated.Value(0)).current;
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanLockedRef = useRef(false);
  const leavingRef = useRef(false);
  const mountedRef = useRef(true);

  const mode: ScanMode = useMemo(() => {
    const raw = Array.isArray(params.mode) ? params.mode[0] : params.mode;
    if (raw === 'send') return 'send';
    if (raw === 'watch-only') return 'watch-only';
    if (raw === 'address-book') return 'address-book';
    return 'default';
  }, [params.mode]);

  const returnTokenId =
    typeof params.tokenId === 'string'
      ? params.tokenId
      : Array.isArray(params.tokenId)
        ? String(params.tokenId[0] || '').trim()
        : '';

  const returnContactName =
    typeof params.contactName === 'string'
      ? params.contactName.trim()
      : Array.isArray(params.contactName)
        ? String(params.contactName[0] || '').trim()
        : '';

  const hasResult = Boolean(scannedValue);
  const scanLabel = useMemo(() => getScanLabel(scannedType), [scannedType]);
  const scannerPaused = !isFocused;
  const scanViewReady = Boolean(permission?.granted) && cameraReady && scanWindowHeight > 0;

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
    if (backTimerRef.current) {
      clearTimeout(backTimerRef.current);
      backTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimers();
      scanLineAnimation.stopAnimation();
    };
  }, [clearTimers, scanLineAnimation]);

  useFocusEffect(
    useCallback(() => {
      leavingRef.current = false;

      return () => {
        clearTimers();
        scanLineAnimation.stopAnimation();
        scanLockedRef.current = false;
        leavingRef.current = false;
        setCameraReady(false);
        setScanWindowHeight(0);
        setScannedValue('');
        setScannedType(null);
        setTimeoutStage('scan');
        setTimedOut(false);
      };
    }, [clearTimers, scanLineAnimation])
  );

  const safeBack = useCallback(() => {
    if (!mountedRef.current) return;
    goBackOrReplace(router, { pathname, fallback: '/wallet' });
  }, [pathname, router]);

  const scheduleBack = useCallback(
    (delayMs: number) => {
      if (backTimerRef.current) {
        clearTimeout(backTimerRef.current);
      }

      backTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        safeBack();
      }, delayMs);
    },
    [safeBack]
  );

  const handleResolvedAddress = useCallback(
    (address: string) => {
      clearTimers();
      leavingRef.current = true;

      if (mode === 'watch-only') {
        router.replace({
          pathname: '/import-watch-only',
          params: {
            address,
          },
        } as any);
        return;
      }

      if (mode === 'address-book') {
        router.replace({
          pathname: '/address-book',
          params: {
            openAdd: '1',
            prefillAddress: address,
          },
        } as any);
        return;
      }

      if (mode === 'send') {
        router.replace({
          pathname: '/send',
          params: {
            ...(returnTokenId ? { tokenId: returnTokenId } : {}),
            ...(returnContactName ? { contactName: returnContactName } : {}),
            address,
          },
        } as any);
        return;
      }

      router.replace({
        pathname: '/send',
        params: {
          address,
        },
      } as any);
    },
    [clearTimers, mode, returnContactName, returnTokenId, router]
  );

  const resetScannerState = useCallback(() => {
    clearTimers();
    scanLockedRef.current = false;
    leavingRef.current = false;
    setScannedValue('');
    setScannedType(null);
    setTimeoutStage('scan');
    setTimedOut(false);
  }, [clearTimers]);

  useEffect(() => {
    if (scannerPaused || hasResult || timedOut || leavingRef.current) {
      clearTimers();
      return;
    }

    setTimeoutStage('scan');

    warnTimerRef.current = setTimeout(() => {
      if (!mountedRef.current || leavingRef.current) return;
      setTimeoutStage('warn');
      notice.showNeutralNotice(t('QR code not locked yet.'), 1800);
    }, 30000);

    exitTimerRef.current = setTimeout(() => {
      if (!mountedRef.current || scanLockedRef.current || leavingRef.current) return;
      leavingRef.current = true;
      setTimedOut(true);
      clearTimers();
      notice.showNeutralNotice(t('No QR found. Returning to the previous screen.'), 1800);
      scheduleBack(600);
    }, 45000);

    return () => {
      clearTimers();
    };
  }, [clearTimers, hasResult, notice, scannerPaused, scheduleBack, t, timedOut]);

  useEffect(() => {
    const shouldSkipResultTimeout =
      !hasResult || (scannedType === 'address' && mode !== 'default') || leavingRef.current || scannerPaused;

    if (shouldSkipResultTimeout) {
      if (resultExitTimerRef.current) {
        clearTimeout(resultExitTimerRef.current);
        resultExitTimerRef.current = null;
      }
      return;
    }

    setTimeoutStage('result');

    resultExitTimerRef.current = setTimeout(() => {
      if (!mountedRef.current || leavingRef.current) return;
      leavingRef.current = true;
      clearTimers();
      notice.showNeutralNotice(t('Scan result expired. Returning back.'), 1800);
      safeBack();
    }, 60000);

    return () => {
      if (resultExitTimerRef.current) {
        clearTimeout(resultExitTimerRef.current);
        resultExitTimerRef.current = null;
      }
    };
  }, [clearTimers, hasResult, mode, notice, safeBack, scannedType, scannerPaused, t]);

  useEffect(() => {
    if (scannerPaused || hasResult || timedOut) {
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
  }, [hasResult, scanLineAnimation, scannerPaused, timedOut]);

  const handleResolvedValue = useCallback(
    (value: string) => {
      const safe = String(value || '').trim();
      if (!safe || scannerPaused || scanLockedRef.current || leavingRef.current || !mountedRef.current) return;

      const nextType = detectScanKind(safe);

      scanLockedRef.current = true;
      clearTimers();
      setTimedOut(false);
      setTimeoutStage('result');
      setScannedType(nextType);
      setScannedValue(safe);

      if (nextType === 'address' && mode !== 'default') {
        handleResolvedAddress(safe);
      }
    },
    [clearTimers, handleResolvedAddress, mode, scannerPaused]
  );

  const handleBarcodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      const value = String(result?.data || '').trim();
      if (!value || scannerPaused || hasResult || timedOut || scanLockedRef.current || leavingRef.current) return;
      handleResolvedValue(value);
    },
    [handleResolvedValue, hasResult, scannerPaused, timedOut]
  );

  const handleCopy = useCallback(async () => {
    if (!scannedValue || leavingRef.current || !mountedRef.current) return;
    await Clipboard.setStringAsync(scannedValue);
    if (!mountedRef.current || leavingRef.current) return;
    notice.showSuccessNotice(t('Scan result copied.'), 1600);
  }, [notice, scannedValue, t]);

  const handlePrimaryAction = useCallback(async () => {
    if (!scannedValue || leavingRef.current || !mountedRef.current) return;

    leavingRef.current = true;
    clearTimers();

    if (scannedType === 'address') {
      handleResolvedAddress(scannedValue);
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
    if (!mountedRef.current) return;
    notice.showNeutralNotice(t('Result copied. This target cannot open here.'), 1800);
  }, [clearTimers, handleResolvedAddress, notice, router, scannedType, scannedValue, t]);

  const handleScanAgain = useCallback(() => {
    resetScannerState();
  }, [resetScannerState]);

  const handlePickFromGallery = useCallback(async () => {
    try {
      if (scanLockedRef.current || leavingRef.current || !mountedRef.current) return;

      const mediaPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!mediaPermission.granted) {
        if (mountedRef.current && !leavingRef.current) {
          notice.showNeutralNotice(t('Allow photo access to scan QR from gallery.'), 1800);
        }
        return;
      }

      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });

      if (picked.canceled || !picked.assets?.[0]?.uri || !mountedRef.current || leavingRef.current) {
        return;
      }

      setProcessingImage(true);

      const results = await Camera.scanFromURLAsync(picked.assets[0].uri, ['qr']);

      if (!mountedRef.current || leavingRef.current) return;

      if (!results?.length || !results[0]?.data) {
        notice.showNeutralNotice(t('No QR code found in that image.'), 2200);
        return;
      }

      handleResolvedValue(results[0].data);
    } catch (error) {
      console.warn('Failed to scan image QR:', error);
      if (mountedRef.current && !leavingRef.current) {
        notice.showErrorNotice(t('Image QR scan failed.'), 2200);
      }
    } finally {
      if (mountedRef.current) {
        setProcessingImage(false);
      }
    }
  }, [handleResolvedValue, notice, t]);

  const scanLineTravel = Math.max(0, scanWindowHeight - 2);

  const scanLineTranslateY = scanLineAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, scanLineTravel],
  });

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.screen}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: navInsets.top,
              paddingBottom: navInsets.bottom,
            },
          ]}
          showsVerticalScrollIndicator={false}
          bounces={permission?.granted}
        >
          <ScreenBrow label={t('SCAN')} variant="back" />

          <View style={styles.contentStack}>
            {!permission ? (
              <View style={styles.stubCard}>
                <Text style={styles.stubTitle}>{t('Preparing camera')}</Text>
                <Text style={styles.stubText}>{t('Checking camera permission status.')}</Text>
              </View>
            ) : null}

            {permission && !permission.granted ? (
              <View style={styles.stubCard}>
                <Text style={styles.stubTitle}>{t('Camera access required')}</Text>
                <Text style={styles.stubText}>
                  {t('Allow camera access to scan wallet addresses and QR codes.')}
                </Text>

                <TouchableOpacity
                  activeOpacity={0.9}
                  style={[styles.actionButton, styles.primaryButton]}
                  onPress={() => void requestPermission()}
                >
                  <Text
                    style={styles.primaryButtonText}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                  >
                    {t('Allow Camera')}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {permission?.granted ? (
              <>
                <View style={styles.cameraCard}>
                  <CameraView
                    style={[styles.camera, !scanViewReady ? styles.cameraHidden : null]}
                    facing="back"
                    barcodeScannerSettings={{
                      barcodeTypes: ['qr'],
                    }}
                    onCameraReady={() => {
                      if (!mountedRef.current || leavingRef.current) return;
                      setCameraReady(true);
                    }}
                    onBarcodeScanned={scannerPaused || hasResult || timedOut ? undefined : handleBarcodeScanned}
                  />

                  <View
                    style={[styles.overlayRoot, !scanViewReady ? styles.overlayHidden : null]}
                    pointerEvents="none"
                  >
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

                  {hasResult && !(scannedType === 'address' && mode !== 'default') ? (
                    <View style={styles.cameraActionsWrap}>
                      <TouchableOpacity
                        activeOpacity={0.9}
                        style={styles.scanAgainButton}
                        onPress={handleScanAgain}
                      >
                        <Text
                          style={styles.scanAgainButtonText}
                          numberOfLines={2}
                          adjustsFontSizeToFit
                          minimumFontScale={0.8}
                        >
                          {t('Scan again')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {!hasResult && timeoutStage === 'warn' ? (
                    <View style={styles.timeoutNoticeWrap} pointerEvents="none">
                      <Text style={styles.timeoutNoticeText}>{t('Nothing found yet')}</Text>
                    </View>
                  ) : null}

                  {!scanViewReady ? (
                    <View style={styles.cameraBootMask}>
                      <ActivityIndicator size="small" color={colors.accent} />
                      <Text style={styles.cameraBootTitle}>{t('Preparing camera')}</Text>
                      <Text style={styles.cameraBootText}>
                        {t('If the live preview does not appear, scan a QR code from your photo library.')}
                      </Text>
                    </View>
                  ) : null}

                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={styles.galleryButton}
                    onPress={() => void handlePickFromGallery()}
                    disabled={processingImage}
                  >
                    <LottieIcon source={scanGallerySource} size={18} staticFrame={269} />
                  </TouchableOpacity>
                </View>

                {hasResult && !(scannedType === 'address' && mode !== 'default') ? (
                  <View style={styles.resultCard}>
                    <View style={styles.resultTopRow}>
                      <Text style={styles.resultLabel}>{t('Scanned result')}</Text>
                      <Text style={styles.resultType}>{t(scanLabel)}</Text>
                    </View>

                    <Text style={styles.resultValue}>{scannedValue}</Text>

                    <View style={styles.actionsColumn}>
                      <TouchableOpacity
                        activeOpacity={0.9}
                        style={[styles.actionButton, styles.primaryButton, styles.fullWidthButton]}
                        onPress={() => void handlePrimaryAction()}
                      >
                        <Text
                          style={styles.primaryButtonText}
                          numberOfLines={2}
                          adjustsFontSizeToFit
                          minimumFontScale={0.78}
                        >
                          {t(getPrimaryButtonLabel(scannedType, mode))}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.9}
                        style={[styles.actionButton, styles.secondaryButton, styles.fullWidthButton]}
                        onPress={() => void handleCopy()}
                      >
                        <Text
                          style={styles.secondaryButtonText}
                          numberOfLines={2}
                          adjustsFontSizeToFit
                          minimumFontScale={0.8}
                        >
                          {t('Copy')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}
              </>
            ) : null}
          </View>
        </ScrollView>

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

  scroll: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  content: {
    paddingHorizontal: layout.screenPaddingX,
  },

  contentStack: {
    gap: 12,
  },

  cameraCard: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.bg,
    minHeight: 340,
  },

  camera: {
    width: '100%',
    aspectRatio: 1,
    minHeight: 340,
    backgroundColor: colors.bg,
  },

  cameraHidden: {
    opacity: 0,
  },

  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },

  overlayHidden: {
    opacity: 0,
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

  cameraBootMask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 28,
  },

  cameraBootTitle: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: 'Sora_700Bold',
  },

  cameraBootText: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    fontFamily: 'Sora_400Regular',
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
    backgroundColor: colors.accent,
    borderColor: colors.lineStrong,
  },

  secondaryButton: {
    backgroundColor: 'transparent',
    borderColor: colors.lineStrong,
  },

  primaryButtonText: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
    textAlign: 'center',
    alignSelf: 'stretch',
    flexShrink: 1,
  },

  secondaryButtonText: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    textAlign: 'center',
    alignSelf: 'stretch',
    flexShrink: 1,
  },

  stubCard: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 10,
  },

  stubTitle: {
    ...ui.titleSm,
  },

  stubText: {
    ...ui.body,
    color: colors.textSoft,
  },
});
