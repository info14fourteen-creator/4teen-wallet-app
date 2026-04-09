import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, fontFamilies, spacing, typography } from '../src/theme/tokens';
import { hasPasscode } from '../src/security/local-auth';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function BootScreen() {
  const router = useRouter();
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let mounted = true;

    const animate = (value: number, duration: number) =>
      new Promise<void>((resolve) => {
        Animated.timing(progressAnim, {
          toValue: value,
          duration,
          easing: Easing.out(Easing.ease),
          useNativeDriver: false,
        }).start(() => resolve());
      });

    const setVal = async (value: number, duration: number) => {
      if (!mounted) return;
      setProgress(value);
      await animate(value, duration);
    };

    const run = async () => {
      for (let i = 0; i <= 70; i += 7) await setVal(i, 50);
      for (let i = 73; i <= 99; i += 3) await setVal(i, 70);

      await wait(120);

      for (let i = 100; i <= 107; i++) await setVal(i, 100);
      await wait(160);
      for (let i = 108; i <= 114; i++) await setVal(i, 120);

      await wait(220);

      const protectedApp = await hasPasscode();

      if (!mounted) return;

      if (protectedApp) {
        router.replace('/unlock');
        return;
      }

      router.replace('/ui-lab');
    };

    void run();

    return () => {
      mounted = false;
    };
  }, [progressAnim, router]);

  const color = progress >= 100 ? colors.accent : colors.offWhite;

  const width = progressAnim.interpolate({
    inputRange: [0, 114],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.screen}>
      <View style={styles.center}>
        <Text style={[styles.percent, { color }]}>
          {progress}%
        </Text>

        <View style={styles.track}>
          <Animated.View style={[styles.fill, { width, backgroundColor: color }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgBoot,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    width: '76%',
    alignItems: 'center',
  },
  percent: {
    fontSize: typography.bootPercent,
    fontFamily: fontFamilies.display,
    marginBottom: spacing[2],
    letterSpacing: 0,
  },
  track: {
    width: '100%',
    height: 2,
  },
  fill: {
    height: 2,
  },
});
