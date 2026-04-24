import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '../src/ui/app-header';
import {
  APP_HEADER_HEIGHT,
  APP_HEADER_TOP_PADDING,
} from '../src/ui/app-header.constants';
import MenuSheet from '../src/ui/menu-sheet';
import { useBottomInset } from '../src/ui/use-bottom-inset';
import { colors, layout, radius, spacing } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';

const TOP_SHELL_OFFSET = 84;
const BOTTOM_SHELL_OFFSET = 132;

const LOREM = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
  'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
  'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
  'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
  'Curabitur pretium tincidunt lacus. Nulla gravida orci a odio. Nullam varius, turpis et commodo pharetra.',
  'Etiam tempor. Ut ullamcorper, ligula eu tempor congue, eros est euismod turpis, id tincidunt sapien risus a quam.',
  'Maecenas fermentum consequat mi. Donec fermentum. Pellentesque malesuada nulla a mi.',
  'Duis sapien sem, aliquet nec, commodo eget, consequat quis, neque. Aliquam faucibus, elit ut dictum aliquet.',
  'Phasellus fermentum in, dolor. Pellentesque facilisis. Nulla imperdiet sit amet magna.',
  'Vestibulum dapibus, mauris nec malesuada fames ac turpis velit, rhoncus eu, luctus et interdum adipiscing wisi.',
  'Aliquam erat ac ipsum. Integer aliquam purus. Quisque lorem tortor fringilla sed, vestibulum id, eleifend justo vel bibendum.',
  'Donec pede justo, fringilla vel, aliquet nec, vulputate eget, arcu. In enim justo, rhoncus ut, imperdiet a, venenatis vitae, justo.',
];

export default function UiShellLab() {
  const router = useRouter();

  const [menuOpen, setMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const bottomInset = useBottomInset(0);

  const topShellAnim = useRef(new Animated.Value(-TOP_SHELL_OFFSET)).current;
  const bottomShellAnim = useRef(new Animated.Value(BOTTOM_SHELL_OFFSET)).current;

  const runShellIntro = useCallback(() => {
    topShellAnim.stopAnimation();
    bottomShellAnim.stopAnimation();

    topShellAnim.setValue(-TOP_SHELL_OFFSET);
    bottomShellAnim.setValue(BOTTOM_SHELL_OFFSET);

    Animated.parallel([
      Animated.timing(topShellAnim, {
        toValue: 0,
        duration: 320,
        useNativeDriver: true,
      }),
      Animated.timing(bottomShellAnim, {
        toValue: 0,
        duration: 320,
        useNativeDriver: true,
      }),
    ]).start();
  }, [bottomShellAnim, topShellAnim]);

  useEffect(() => {
    runShellIntro();
  }, [runShellIntro]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    runShellIntro();
    await new Promise((resolve) => setTimeout(resolve, 700));
    setRefreshing(false);
  }, [runShellIntro]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dx > 18 && Math.abs(gesture.dy) < 12,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > 90) {
          router.back();
        }
      },
    })
  ).current;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.screen} {...panResponder.panHandlers}>
        <Animated.View
          style={[
            styles.headerSlot,
            {
              transform: [{ translateY: topShellAnim }],
            },
          ]}
        >
          <AppHeader onMenuPress={() => setMenuOpen(true)} />
        </Animated.View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: bottomInset + FOOTER_TEST_HEIGHT + spacing[5] },
          ]}
          showsVerticalScrollIndicator={false}
          bounces
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
              progressBackgroundColor={colors.bg}
            />
          }
        >
          <View style={styles.heroBlock}>
            <Text style={ui.sectionEyebrow}>UI SHELL EYEBROW</Text>
            <Text style={styles.title}>Unified shell test polygon</Text>
            <Text style={styles.lead}>
              This screen is a controlled shell sandbox for rebuilding the top menu,
              bottom menu, eyebrow system, keyboard behavior, and page transitions.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>INPUT TEST</Text>

            <View style={styles.inputShell}>
              <TextInput
                value={inputValue}
                onChangeText={setInputValue}
                placeholder="Type something here..."
                placeholderTextColor={colors.textDim}
                style={styles.input}
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>LOREM IPSUM</Text>

            <View style={styles.loremCard}>
              {LOREM.map((paragraph, index) => (
                <Text key={`${paragraph}-${index}`} style={styles.paragraph}>
                  {paragraph}
                </Text>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.primaryButton}
              onPress={handleRefresh}
            >
              <Text style={styles.primaryButtonText}>Reload shell animation</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <Animated.View
          pointerEvents="none"
          style={[
            styles.bottomShell,
            {
              transform: [{ translateY: bottomShellAnim }],
            },
          ]}
        >
          <View style={styles.bottomShellLine} />
          <View style={styles.bottomShellRow}>
            <View style={styles.bottomShellItem}>
              <Text style={styles.bottomShellLabel}>AIRDROP</Text>
            </View>

            <View style={styles.bottomShellItem}>
              <Text style={styles.bottomShellLabel}>BUY</Text>
            </View>

            <View style={styles.bottomShellCenter}>
              <View style={styles.bottomShellCircle} />
              <Text style={styles.bottomShellCenterLabel}>WALLET</Text>
            </View>

            <View style={styles.bottomShellItem}>
              <Text style={styles.bottomShellLabel}>SWAP</Text>
            </View>

            <View style={styles.bottomShellItem}>
              <Text style={styles.bottomShellLabel}>AMBASSADOR</Text>
            </View>
          </View>
        </Animated.View>

        <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
      </View>
    </SafeAreaView>
  );
}

const FOOTER_TEST_HEIGHT = 104;

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
    zIndex: 10,
  },

  scroll: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  content: {
    paddingTop: 14,
  },

  heroBlock: {
    marginBottom: 28,
    gap: 10,
  },

  title: {
    ...ui.titleLg,
  },

  lead: {
    ...ui.body,
    color: colors.textSoft,
  },

  section: {
    marginBottom: 24,
    gap: 10,
  },

  sectionLabel: {
    ...ui.muted,
  },

  inputShell: {
    minHeight: 54,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },

  input: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: 'Sora_600SemiBold',
  },

  loremCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
  },

  paragraph: {
    ...ui.body,
    color: colors.textSoft,
  },

  primaryButton: {
    minHeight: layout.buttonHeight,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },

  primaryButtonText: {
    color: colors.bg,
    fontSize: 15,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },

  bottomShell: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: FOOTER_TEST_HEIGHT,
    backgroundColor: colors.bg,
    justifyContent: 'flex-end',
    paddingBottom: 10,
    paddingHorizontal: 8,
  },

  bottomShellLine: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: 14,
    height: 1,
    backgroundColor: 'rgba(255,105,0,0.32)',
  },

  bottomShellRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },

  bottomShellItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    minHeight: 62,
  },

  bottomShellLabel: {
    color: colors.white,
    fontSize: 9,
    lineHeight: 12,
    fontFamily: 'Sora_600SemiBold',
    textAlign: 'center',
  },

  bottomShellCenter: {
    flex: 1.2,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },

  bottomShellCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: colors.bg,
  },

  bottomShellCenterLabel: {
    marginTop: 4,
    color: colors.accent,
    fontSize: 9,
    lineHeight: 12,
    fontFamily: 'Sora_600SemiBold',
    textAlign: 'center',
  },
});
