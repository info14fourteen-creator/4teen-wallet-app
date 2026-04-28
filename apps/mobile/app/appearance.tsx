import { useCallback, useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { useI18n } from '../src/i18n';
import { ProductHero, ProductScreen } from '../src/ui/product-shell';
import { colors } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';

const STANAT_IMAGE = require('../assets/icons/ui/stanat.png');
const EASTER_EGG_HOLD_DELAY_MS = 3000;
const EASTER_EGG_REVEAL_DURATION_MS = 3200;
const EASTER_EGG_MAX_OPACITY = 0.35;

export default function AppearanceScreen() {
  const { t } = useI18n();
  const portraitOpacity = useRef(new Animated.Value(0)).current;
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealStartedRef = useRef(false);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const stopReveal = useCallback(() => {
    portraitOpacity.stopAnimation();
  }, [portraitOpacity]);

  const handlePressIn = () => {
    clearHoldTimer();

    holdTimerRef.current = setTimeout(() => {
      revealStartedRef.current = true;
      Animated.timing(portraitOpacity, {
        toValue: EASTER_EGG_MAX_OPACITY,
        duration: EASTER_EGG_REVEAL_DURATION_MS,
        useNativeDriver: true,
      }).start();
    }, EASTER_EGG_HOLD_DELAY_MS);
  };

  const handlePressOut = () => {
    clearHoldTimer();
    if (revealStartedRef.current) {
      stopReveal();
      revealStartedRef.current = false;
    }
  };

  useEffect(() => {
    return () => {
      clearHoldTimer();
      stopReveal();
    };
  }, [clearHoldTimer, stopReveal]);

  return (
    <ProductScreen eyebrow={t('APPEARANCE')}>
      <View style={styles.stage}>
        <Pressable
          style={styles.stageHoldZone}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        />

        <Animated.View style={[styles.stagePortrait, { opacity: portraitOpacity }]}>
          <Image source={STANAT_IMAGE} style={styles.stagePortraitImage} contentFit="contain" />
        </Animated.View>

        <View style={styles.foreground}>
          <ProductHero
            eyebrow={t('DARK SIDE ACTIVE')}
            title={t('Stay with the Siths')}
            body={t(
              'Light mode is still under construction. The wallet remains on the dark side until the appearance system is rebuilt the right way.'
            )}
          />

          <View style={styles.sectionList}>
            <View style={[styles.row, styles.pastRow]}>
              <Text style={[styles.rowLabel, styles.pastLabel]}>{t('Past')}</Text>
              <Text style={styles.rowText}>{t('The past cannot be changed.')}</Text>
            </View>
            <View style={[styles.row, styles.nowRow]}>
              <Text style={[styles.rowLabel, styles.nowLabel]}>{t('Now')}</Text>
              <Text style={styles.rowText}>{t('One stable dark theme across the whole wallet.')}</Text>
            </View>
            <View style={[styles.row, styles.futureRow]}>
              <Text style={[styles.rowLabel, styles.futureLabel]}>{t('Future')}</Text>
              <Text style={styles.rowText}>{t('The future is not here yet. Live now.')}</Text>
            </View>
          </View>
        </View>
      </View>
    </ProductScreen>
  );
}

const styles = StyleSheet.create({
  stage: {
    position: 'relative',
    overflow: 'hidden',
    minHeight: 620,
  },

  stageHoldZone: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },

  stagePortrait: {
    position: 'absolute',
    right: 118,
    bottom: -34,
    width: 160,
    height: 210,
    zIndex: 0,
  },

  stagePortraitImage: {
    width: '100%',
    height: '100%',
  },

  foreground: {
    position: 'relative',
    zIndex: 1,
  },

  sectionList: {
    gap: 14,
  },

  row: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 6,
  },

  rowLabel: {
    ...ui.sectionEyebrow,
  },

  rowText: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: 'Sora_600SemiBold',
  },

  pastRow: {
    backgroundColor: 'rgba(255,48,73,0.07)',
    borderColor: 'rgba(255,48,73,0.2)',
  },

  nowRow: {
    backgroundColor: 'rgba(21,224,56,0.07)',
    borderColor: 'rgba(21,224,56,0.2)',
  },

  futureRow: {
    backgroundColor: 'rgba(255,105,0,0.07)',
    borderColor: 'rgba(255,105,0,0.2)',
  },

  pastLabel: {
    color: colors.red,
  },

  nowLabel: {
    color: colors.green,
  },

  futureLabel: {
    color: colors.accent,
  },
});
