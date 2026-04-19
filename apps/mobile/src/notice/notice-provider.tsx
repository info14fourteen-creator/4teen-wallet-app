import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  colors,
  fontFamilies,
  radius,
} from '../theme/tokens';
import {
  NAV_HEADER_TOP_PADDING,
  NAV_HEADER_DROP_OFFSET,
} from '../ui/navigation.constants';

type NoticeType = 'neutral' | 'success' | 'error' | 'update';
type NoticeDismissMode = 'auto' | 'sticky' | 'ack';

type NoticeAction = {
  label: string;
  onPress: () => void;
};

type NoticeOptions = {
  type?: NoticeType;
  message: string;
  duration?: number;
  dismissMode?: NoticeDismissMode;
  actions?: NoticeAction[];
};

type InternalNotice = {
  id: number;
  type: NoticeType;
  message: string;
  duration: number;
  dismissMode: NoticeDismissMode;
  actions: NoticeAction[];
};

type NoticeContextValue = {
  showNotice: (options: NoticeOptions) => void;
  hideNotice: () => void;
  showSuccessNotice: (message: string, duration?: number) => void;
  showErrorNotice: (message: string, duration?: number) => void;
  showNeutralNotice: (message: string, duration?: number) => void;
  showUpdateNotice: (message: string, duration?: number) => void;
  showStickyNotice: (message: string, type?: NoticeType) => void;
  showAckNotice: (message: string, actions: NoticeAction[], type?: NoticeType) => void;
};

type NoticeBoxSize = {
  width: number;
  height: number;
};

const NoticeContext = createContext<NoticeContextValue | null>(null);

const NOTICE_RADIUS = 14;
const NOTICE_STROKE = 1.5;
const EXTRA_MS_PER_LINE = 1400;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

function normalizeNotice(input: NoticeOptions, id: number): InternalNotice {
  return {
    id,
    type: input.type ?? 'neutral',
    message: input.message,
    duration: input.duration && input.duration > 0 ? input.duration : 5000,
    dismissMode: input.dismissMode ?? 'auto',
    actions: Array.isArray(input.actions) ? input.actions : [],
  };
}

function areActionsEquivalent(a: NoticeAction[], b: NoticeAction[]) {
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i += 1) {
    if (a[i].label !== b[i].label) return false;
  }

  return true;
}

function getRoundedRectPerimeter(width: number, height: number, r: number) {
  if (width <= 0 || height <= 0) return 0;

  const clampedRadius = Math.max(0, Math.min(r, width / 2, height / 2));
  return 2 * (width + height - 4 * clampedRadius) + 2 * Math.PI * clampedRadius;
}

function getEffectiveDuration(baseDuration: number, lineCount: number) {
  return baseDuration + Math.max(0, lineCount - 1) * EXTRA_MS_PER_LINE;
}

export function NoticeProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [notice, setNotice] = useState<InternalNotice | null>(null);
  const [boxSize, setBoxSize] = useState<NoticeBoxSize>({ width: 0, height: 0 });
  const [messageLineCount, setMessageLineCount] = useState(0);

  const nextIdRef = useRef(1);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animatedNoticeIdRef = useRef<number | null>(null);

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-10)).current;
  const borderProgress = useRef(new Animated.Value(1)).current;

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const resetBorderProgress = useCallback(() => {
    borderProgress.stopAnimation();
    borderProgress.setValue(1);
  }, [borderProgress]);

  const stopBorderProgress = useCallback(() => {
    borderProgress.stopAnimation();
    borderProgress.setValue(0);
  }, [borderProgress]);

  const animateIn = useCallback(() => {
    opacity.setValue(0);
    translateY.setValue(-10);

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY]);

  const animateOut = useCallback((onDone?: () => void) => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 160,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: -10,
        duration: 160,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(() => onDone?.());
  }, [opacity, translateY]);

  const hideNotice = useCallback(() => {
    clearHideTimer();
    stopBorderProgress();

    animateOut(() => {
      animatedNoticeIdRef.current = null;
      setNotice(null);
      setBoxSize({ width: 0, height: 0 });
      setMessageLineCount(0);
    });
  }, [animateOut, clearHideTimer, stopBorderProgress]);

  const showNotice = useCallback((input: NoticeOptions) => {
    clearHideTimer();
    stopBorderProgress();
    opacity.stopAnimation();
    translateY.stopAnimation();
    animatedNoticeIdRef.current = null;

    setNotice((current) => {
      const prepared = normalizeNotice(input, nextIdRef.current++);

      setBoxSize({ width: 0, height: 0 });
      setMessageLineCount(0);

      if (!current) {
        return prepared;
      }

      const canSoftUpdateAck =
        current.dismissMode === 'ack' &&
        prepared.dismissMode === 'ack' &&
        current.type === prepared.type;

      if (canSoftUpdateAck) {
        const sameMessage = current.message === prepared.message;
        const sameActions = areActionsEquivalent(current.actions, prepared.actions);

        if (sameMessage && sameActions) {
          return current;
        }

        return {
          ...prepared,
          id: current.id,
        };
      }

      return prepared;
    });
  }, [clearHideTimer, opacity, stopBorderProgress, translateY]);

  const borderPerimeter = useMemo(
    () => getRoundedRectPerimeter(boxSize.width, boxSize.height, NOTICE_RADIUS),
    [boxSize.height, boxSize.width]
  );

  const effectiveDuration = useMemo(() => {
    if (!notice || messageLineCount <= 0) return 0;
    return getEffectiveDuration(notice.duration, messageLineCount);
  }, [messageLineCount, notice]);

  const isAutoNotice = notice?.dismissMode === 'auto';
  const isMeasured = boxSize.width > 0 && boxSize.height > 0 && messageLineCount > 0;
  const canRunAutoTimeline = Boolean(notice && isAutoNotice && isMeasured && borderPerimeter > 0 && effectiveDuration > 0);

  useEffect(() => {
    if (!notice) return;

    const shouldAnimateIn = animatedNoticeIdRef.current !== notice.id;

    if (notice.dismissMode !== 'auto') {
      if (shouldAnimateIn) {
        animateIn();
        animatedNoticeIdRef.current = notice.id;
      }

      clearHideTimer();
      stopBorderProgress();

      return () => {
        clearHideTimer();
      };
    }

    if (!canRunAutoTimeline) {
      clearHideTimer();
      resetBorderProgress();
      return () => {
        clearHideTimer();
      };
    }

    if (shouldAnimateIn) {
      animateIn();
      animatedNoticeIdRef.current = notice.id;
    }

    clearHideTimer();
    resetBorderProgress();

    Animated.timing(borderProgress, {
      toValue: 0,
      duration: effectiveDuration,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    hideTimerRef.current = setTimeout(() => {
      hideNotice();
    }, effectiveDuration);

    return () => {
      clearHideTimer();
      borderProgress.stopAnimation();
    };
  }, [
    animateIn,
    borderProgress,
    canRunAutoTimeline,
    clearHideTimer,
    effectiveDuration,
    hideNotice,
    notice,
    resetBorderProgress,
    stopBorderProgress,
  ]);

  const value = useMemo<NoticeContextValue>(() => ({
    showNotice,
    hideNotice,
    showSuccessNotice: (message, duration = 5000) =>
      showNotice({ type: 'success', message, duration, dismissMode: 'auto' }),
    showErrorNotice: (message, duration = 5000) =>
      showNotice({ type: 'error', message, duration, dismissMode: 'auto' }),
    showNeutralNotice: (message, duration = 5000) =>
      showNotice({ type: 'neutral', message, duration, dismissMode: 'auto' }),
    showUpdateNotice: (message, duration = 5000) =>
      showNotice({ type: 'update', message, duration, dismissMode: 'auto' }),
    showStickyNotice: (message, type = 'neutral') =>
      showNotice({ type, message, dismissMode: 'sticky' }),
    showAckNotice: (message, actions, type = 'neutral') =>
      showNotice({ type, message, dismissMode: 'ack', actions }),
  }), [hideNotice, showNotice]);

  const borderGlowColor =
    notice?.type === 'success'
      ? colors.green
      : notice?.type === 'error'
        ? colors.red
        : notice?.type === 'update'
          ? colors.accent
          : colors.lightCool;

  const messageColor =
    notice?.type === 'success'
      ? colors.green
      : notice?.type === 'error'
        ? colors.red
        : notice?.type === 'update'
          ? colors.accent
          : colors.lightCool;

  const actions = notice?.actions ?? [];
  const animatedVisibleBorder = borderProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.001, borderPerimeter],
  });

  return (
    <NoticeContext.Provider value={value}>
      {children}

      {notice ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.layer,
            {
              top:
                Math.max(insets.top, NAV_HEADER_TOP_PADDING) +
                NAV_HEADER_DROP_OFFSET +
                51,
            },
          ]}
        >
          <AnimatedPressable
            key={notice.id}
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout;
              if (width !== boxSize.width || height !== boxSize.height) {
                setBoxSize({ width, height });
              }
            }}
            style={[
              styles.notice,
              {
                opacity,
                transform: [{ translateY }],
              },
            ]}
          >
            {isAutoNotice && borderPerimeter > 0 ? (
              <View pointerEvents="none" style={styles.borderOverlay}>
                <Svg width={boxSize.width} height={boxSize.height}>
                  <Rect
                    x={NOTICE_STROKE / 2}
                    y={NOTICE_STROKE / 2}
                    width={Math.max(boxSize.width - NOTICE_STROKE, 0)}
                    height={Math.max(boxSize.height - NOTICE_STROKE, 0)}
                    rx={NOTICE_RADIUS}
                    ry={NOTICE_RADIUS}
                    stroke="rgba(255,255,255,0.10)"
                    strokeWidth={NOTICE_STROKE}
                    fill="none"
                  />
                  <AnimatedRect
                    x={NOTICE_STROKE / 2}
                    y={NOTICE_STROKE / 2}
                    width={Math.max(boxSize.width - NOTICE_STROKE, 0)}
                    height={Math.max(boxSize.height - NOTICE_STROKE, 0)}
                    rx={NOTICE_RADIUS}
                    ry={NOTICE_RADIUS}
                    stroke={borderGlowColor}
                    strokeWidth={NOTICE_STROKE}
                    fill="none"
                    strokeLinecap="butt"
                    strokeDasharray={[animatedVisibleBorder, borderPerimeter]}
                    strokeDashoffset={0}
                  />
                </Svg>
              </View>
            ) : null}

            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.closeButton}
              onPress={hideNotice}
            >
              <Ionicons name="close" size={14} color={colors.white} />
            </TouchableOpacity>

            <View style={styles.content}>
              <View style={styles.textWrap}>
                <Text
                  onTextLayout={(event) => {
                    const nextCount = Math.max(1, event.nativeEvent.lines.length || 1);
                    setMessageLineCount((current) => (current === nextCount ? current : nextCount));
                  }}
                  style={[styles.message, { color: messageColor }]}
                >
                  {notice.message}
                </Text>

                {actions.length > 0 ? (
                  <View style={styles.actionsWrap}>
                    {actions.map((action) => (
                      <TouchableOpacity
                        key={action.label}
                        activeOpacity={0.85}
                        style={styles.actionButton}
                        onPress={() => {
                          action.onPress();
                          hideNotice();
                        }}
                      >
                        <Text style={styles.actionButtonText}>{action.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </View>
            </View>
          </AnimatedPressable>
        </View>
      ) : null}
    </NoticeContext.Provider>
  );
}

export function useNotice() {
  const context = useContext(NoticeContext);

  if (!context) {
    throw new Error('useNotice must be used inside NoticeProvider');
  }

  return context;
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 2147483000,
    pointerEvents: 'box-none',
  },

  notice: {
    width: '92%',
    maxWidth: 420,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
    borderRadius: NOTICE_RADIUS,
    backgroundColor: 'rgba(26,26,26,0.98)',
    shadowColor: '#000',
    shadowOpacity: 0.42,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 18,
  },

  borderOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: NOTICE_RADIUS,
  },

  content: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },

  textWrap: {
    width: '100%',
    alignItems: 'center',
    gap: 12,
  },

  message: {
    fontFamily: fontFamilies.displaySemi,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },

  closeButton: {
    position: 'absolute',
    top: -12,
    right: -12,
    width: 34,
    height: 34,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    backgroundColor: 'rgb(0,0,0)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.32,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
    zIndex: 2,
  },

  actionsWrap: {
    width: '100%',
    gap: 8,
  },

  actionButton: {
    minHeight: 42,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,105,0,0.16)',
    backgroundColor: 'rgba(255,105,0,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },

  actionButtonText: {
    color: colors.accent,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: fontFamilies.displaySemi,
  },
});
