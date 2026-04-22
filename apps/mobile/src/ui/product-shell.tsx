import type { ReactElement, ReactNode } from 'react';
import {
  Pressable,
  type RefreshControlProps,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, layout, radius } from '../theme/tokens';
import { ui } from '../theme/ui';
import ScreenBrow from './screen-brow';
import { useBottomInset } from './use-bottom-inset';
import { useNavigationInsets } from './navigation';

export function ProductScreen({
  eyebrow,
  browVariant = 'back',
  children,
  refreshControl,
  bottomInsetExtra,
}: {
  eyebrow: string;
  browVariant?: 'plain' | 'back';
  children: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
  bottomInsetExtra?: number;
}) {
  const navInsets = useNavigationInsets({ topExtra: 14 });
  const contentBottomInset = useBottomInset(bottomInsetExtra);

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.screen}>
        <ScrollView
          style={styles.scroll}
          refreshControl={refreshControl}
          contentContainerStyle={[
            styles.content,
            { paddingTop: navInsets.top, paddingBottom: contentBottomInset },
          ]}
          showsVerticalScrollIndicator={false}
          bounces={Boolean(refreshControl)}
          alwaysBounceVertical={Boolean(refreshControl)}
        >
          <ScreenBrow label={eyebrow} variant={browVariant} />
          {children}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

export function ProductHero({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <View style={styles.heroCard}>
      <Text style={ui.eyebrow}>{eyebrow}</Text>
      <Text style={styles.heroTitle}>{title}</Text>
      <Text style={styles.heroBody}>{body}</Text>
      {children ? <View style={styles.heroChildren}>{children}</View> : null}
    </View>
  );
}

export function ProductStatGrid({
  items,
}: {
  items: { eyebrow: string; value: string; body: string }[];
}) {
  return (
    <View style={styles.statGrid}>
      {items.map((item) => (
        <View key={`${item.eyebrow}-${item.value}`} style={styles.statCard}>
          <Text style={ui.muted}>{item.eyebrow}</Text>
          <Text style={styles.statValue}>{item.value}</Text>
          <Text style={styles.statBody}>{item.body}</Text>
        </View>
      ))}
    </View>
  );
}

export function ProductSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <Text style={ui.sectionEyebrow}>{eyebrow}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionChildren}>{children}</View>
    </View>
  );
}

export function ProductBulletList({ items }: { items: string[] }) {
  return (
    <View style={styles.bulletList}>
      {items.map((item) => (
        <View key={item} style={styles.bulletRow}>
          <View style={styles.bulletDot} />
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export function ProductActionRow({
  primaryLabel,
  onPrimaryPress,
  secondaryLabel,
  onSecondaryPress,
}: {
  primaryLabel: string;
  onPrimaryPress: () => void;
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
}) {
  return (
    <View style={styles.actionRow}>
      <ActionButton label={primaryLabel} onPress={onPrimaryPress} variant="primary" />
      {secondaryLabel && onSecondaryPress ? (
        <ActionButton label={secondaryLabel} onPress={onSecondaryPress} variant="secondary" />
      ) : null}
    </View>
  );
}

export function ProductRouteCard({
  eyebrow,
  title,
  body,
  value,
  primaryLabel,
  onPrimaryPress,
  secondaryLabel,
  onSecondaryPress,
  icon,
}: {
  eyebrow: string;
  title: string;
  body: string;
  value?: string;
  primaryLabel: string;
  onPrimaryPress: () => void;
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
}) {
  return (
    <Pressable onPress={onPrimaryPress} style={styles.routeCard}>
      <View style={styles.routeTopRow}>
        <View style={styles.routeCopy}>
          <Text style={ui.eyebrow}>{eyebrow}</Text>
          <Text style={styles.routeTitle}>{title}</Text>
        </View>
        <View style={styles.routeMeta}>
          {value ? <Text style={styles.routeValue}>{value}</Text> : null}
          {icon ? (
            <MaterialCommunityIcons name={icon} size={22} color={colors.accent} />
          ) : (
            <MaterialCommunityIcons name="arrow-top-right" size={22} color={colors.accent} />
          )}
        </View>
      </View>

      <Text style={styles.routeBody}>{body}</Text>

      <ProductActionRow
        primaryLabel={primaryLabel}
        onPrimaryPress={onPrimaryPress}
        secondaryLabel={secondaryLabel}
        onSecondaryPress={onSecondaryPress}
      />
    </Pressable>
  );
}

export function ProductSplitRows({
  rows,
}: {
  rows: { eyebrow: string; title: string; body: string; accent?: boolean }[];
}) {
  return (
    <View style={styles.splitStack}>
      {rows.map((row) => (
        <View
          key={`${row.eyebrow}-${row.title}`}
          style={[styles.splitCard, row.accent && styles.splitCardAccent]}
        >
          <Text style={row.accent ? styles.splitEyebrowAccent : ui.sectionEyebrow}>
            {row.eyebrow}
          </Text>
          <Text style={styles.splitTitle}>{row.title}</Text>
          <Text style={styles.splitBody}>{row.body}</Text>
        </View>
      ))}
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  variant,
}: {
  label: string;
  onPress: () => void;
  variant: 'primary' | 'secondary';
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={[styles.actionButton, variant === 'primary' ? styles.primaryButton : styles.secondaryButton]}
    >
      <Text style={variant === 'primary' ? styles.primaryButtonText : styles.secondaryButtonText}>
        {label}
      </Text>
    </TouchableOpacity>
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

  scroll: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  content: {
    gap: 0,
  },

  heroCard: {
    backgroundColor: 'rgba(255,105,0,0.07)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
    marginBottom: 16,
  },

  heroTitle: {
    ...ui.titleLg,
    fontSize: 28,
    lineHeight: 34,
  },

  heroBody: {
    ...ui.body,
    color: colors.textSoft,
    lineHeight: 24,
  },

  heroChildren: {
    marginTop: 6,
  },

  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },

  statCard: {
    minWidth: '47%',
    flexGrow: 1,
    backgroundColor: colors.surfaceSoft,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
  },

  statValue: {
    color: colors.white,
    fontSize: 21,
    lineHeight: 26,
    fontFamily: 'Sora_700Bold',
  },

  statBody: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 18,
  },

  sectionCard: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
    marginBottom: 16,
  },

  sectionTitle: {
    ...ui.titleSm,
  },

  sectionChildren: {
    gap: 12,
  },

  bulletList: {
    gap: 10,
  },

  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },

  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.accent,
    marginTop: 9,
  },

  bulletText: {
    flex: 1,
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 22,
  },

  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  actionButton: {
    minHeight: 48,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexGrow: 1,
  },

  primaryButton: {
    backgroundColor: colors.accent,
  },

  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.lineStrong,
  },

  primaryButtonText: {
    color: colors.bg,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },

  secondaryButtonText: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },

  routeCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },

  routeTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
  },

  routeCopy: {
    flex: 1,
    gap: 6,
  },

  routeMeta: {
    alignItems: 'flex-end',
    gap: 8,
  },

  routeTitle: {
    ...ui.titleSm,
  },

  routeValue: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.45,
  },

  routeBody: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 22,
  },

  splitStack: {
    gap: 10,
  },

  splitCard: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: 'rgba(255,255,255,0.025)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
  },

  splitCardAccent: {
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(255,105,0,0.08)',
  },

  splitEyebrowAccent: {
    color: colors.white,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.45,
  },

  splitTitle: {
    color: colors.white,
    fontSize: 16,
    lineHeight: 21,
    fontFamily: 'Sora_700Bold',
  },

  splitBody: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 21,
  },
});
