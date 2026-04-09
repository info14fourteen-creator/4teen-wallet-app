import type { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  colors,
  fontFamilies,
  layout,
  radius,
  spacing,
  typography,
} from '../theme/tokens';

export function AppScreen({
  children,
  bottom,
}: {
  children: ReactNode;
  bottom?: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        <View style={styles.topSpacer} />
        <View style={styles.main}>{children}</View>
        {bottom ? <View style={styles.bottom}>{bottom}</View> : null}
      </View>
    </SafeAreaView>
  );
}

export function Hero({
  children,
}: {
  children: ReactNode;
}) {
  return <View style={styles.hero}>{children}</View>;
}

export function Eyebrow({
  children,
}: {
  children: ReactNode;
}) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function Title({
  children,
}: {
  children: ReactNode;
}) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Lead({
  children,
}: {
  children: ReactNode;
}) {
  return <Text style={styles.lead}>{children}</Text>;
}

export function FeatureCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

export function BulletList({
  items,
}: {
  items: string[];
}) {
  return (
    <View style={styles.list}>
      {items.map((item) => (
        <Text key={item} style={styles.listItem}>
          • {item}
        </Text>
      ))}
    </View>
  );
}

export function BottomActions({
  primaryLabel,
  secondaryLabel,
  onPrimaryPress,
  onSecondaryPress,
}: {
  primaryLabel: string;
  secondaryLabel: string;
  onPrimaryPress?: () => void;
  onSecondaryPress?: () => void;
}) {
  return (
    <View style={styles.actions}>
      <TouchableOpacity activeOpacity={0.9} style={styles.primaryButton} onPress={onPrimaryPress}>
        <Text style={styles.primaryButtonText}>{primaryLabel}</Text>
      </TouchableOpacity>

      <TouchableOpacity activeOpacity={0.9} style={styles.secondaryButton} onPress={onSecondaryPress}>
        <Text style={styles.secondaryButtonText}>{secondaryLabel}</Text>
      </TouchableOpacity>
    </View>
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
  },
  topSpacer: {
    height: layout.topOffset,
  },
  main: {
    flex: 1,
    justifyContent: 'center',
    gap: 20,
  },
  bottom: {
    paddingTop: spacing[4],
    paddingBottom: layout.bottomOffset,
  },
  hero: {
    gap: 16,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: typography.eyebrow,
    lineHeight: 16,
    fontFamily: fontFamilies.display,
    letterSpacing: 0,
  },
  title: {
    color: colors.white,
    fontSize: typography.titleLg,
    lineHeight: 40,
    fontFamily: fontFamilies.display,
    letterSpacing: 0,
    maxWidth: '96%',
  },
  lead: {
    color: colors.textSoft,
    fontSize: typography.lead,
    lineHeight: 28,
    letterSpacing: 0,
    maxWidth: '96%',
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing[4],
    gap: 14,
  },
  cardTitle: {
    color: colors.white,
    fontSize: typography.titleSm,
    lineHeight: 28,
    fontFamily: fontFamilies.displaySemi,
    letterSpacing: 0,
  },
  cardBody: {
    gap: 8,
  },
  list: {
    gap: 8,
  },
  listItem: {
    color: colors.textSoft,
    fontSize: typography.body,
    lineHeight: 24,
    letterSpacing: 0,
  },
  actions: {
    gap: layout.buttonGap,
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
    color: colors.white,
    fontSize: 15,
    lineHeight: 18,
    fontFamily: fontFamilies.display,
    letterSpacing: 0,
  },
  secondaryButton: {
    minHeight: layout.buttonHeight,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  secondaryButtonText: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 18,
    letterSpacing: 0,
  },
});
