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
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import {
  colors,
  fontFamilies,
  radius,
} from '../theme/tokens';
import {
  APP_HEADER_HEIGHT,
  APP_HEADER_TOP_PADDING,
} from '../ui/app-header';

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

const NoticeContext = createContext<NoticeContextValue | null>(null);

const RADIUS = 15;
const STROKE = 3;
const SIZE = 34;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

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

export function NoticeProvider({ children }: { children: React.ReactNode }) {
  const [notice, setNotice] = useState<InternalNotice | null>(null);
  const nextIdRef = useRef(1);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-10)).current;
  const progress = useRef(new Animated.Value(0)).current;

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const animateIn = useCallback(() => {
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

    Animated.timing(progress, {
      toValue: 0,
      duration: 80,
      useNativeDriver: false,
    }).start();

    animateOut(() => {
      setNotice(null);
    });
  }, [animateOut, clearHideTimer, progress]);

  const showNotice = useCallback((input: NoticeOptions) => {
    clearHideTimer();
    const prepared = normalizeNotice(input, nextIdRef.current++);
    setNotice(prepared);
  }, [clearHideTimer]);

  useEffect(() => {
    if (!notice) return;

    opacity.setValue(0);
    translateY.setValue(-10);
    progress.setValue(0);

    animateIn();

    if (notice.dismissMode === 'auto') {
      Animated.timing(progress, {
        toValue: CIRCUMFERENCE,
        duration: notice.duration,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start();

      hideTimerRef.current = setTimeout(() => {
        hideNotice();
      }, notice.duration);
    }

    return () => {
      clearHideTimer();
    };
  }, [
    notice,
    animateIn,
    clearHideTimer,
    hideNotice,
    opacity,
    progress,
    translateY,
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

  const progressColor =
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

  return (
    <NoticeContext.Provider value={value}>
      {children}

      {notice ? (
        <View pointerEvents="box-none" style={styles.layer}>
          <AnimatedPressable
            style={[
              styles.notice,
              {
                opacity,
                transform: [{ translateY }],
              },
            ]}
          >
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.closeButton}
              onPress={hideNotice}
            >
              <Ionicons name="close" size={14} color={colors.white} />
            </TouchableOpacity>

            <View style={styles.content}>
              {notice.dismissMode === 'auto' ? (
                <Svg width={SIZE} height={SIZE} style={styles.ring}>
                  <Circle
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={RADIUS}
                    stroke="rgba(255,255,255,0.12)"
                    strokeWidth={STROKE}
                    fill="none"
                  />
                  <AnimatedCircle
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={RADIUS}
                    stroke={progressColor}
                    strokeWidth={STROKE}
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${CIRCUMFERENCE}`}
                    strokeDashoffset={progress}
                    rotation={-90}
                    origin={`${SIZE / 2}, ${SIZE / 2}`}
                  />
                </Svg>
              ) : null}

              <View style={styles.textWrap}>
                <Text style={[styles.message, { color: messageColor }]}>
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
    top: APP_HEADER_TOP_PADDING + APP_HEADER_HEIGHT + 14,
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
    borderRadius: 14,
    backgroundColor: 'rgba(26,26,26,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    shadowColor: '#000',
    shadowOpacity: 0.42,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 18,
  },

  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingRight: 18,
  },

  ring: {
    flexShrink: 0,
    marginTop: 2,
  },

  textWrap: {
    flex: 1,
    gap: 12,
  },

  message: {
    fontFamily: fontFamilies.displaySemi,
    fontSize: 15,
    lineHeight: 22,
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
