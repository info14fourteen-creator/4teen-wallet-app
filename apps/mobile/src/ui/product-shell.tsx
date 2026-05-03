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
import { useLocaleLayout } from '../i18n';
import InfoToggleIcon from './info-toggle-icon';
import KeyboardView from './KeyboardView';
import ScreenBrow from './screen-brow';
import ScreenLoadingOverlay from './screen-loading-overlay';
import { useBottomInset } from './use-bottom-inset';
import { useNavigationInsets } from './navigation';

export function ProductScreen({
  eyebrow,
  browVariant = 'back',
  onBackPress,
  children,
  refreshControl,
  bottomInsetExtra,
  keyboardAware = false,
  keyboardExtraScrollHeight = 42,
  loadingOverlayVisible = false,
  headerInfo,
  browLabelPress,
  browLabelAccessory,
  browLabelAccessoryAnimation,
}: {
  eyebrow: string;
  browVariant?: 'plain' | 'back' | 'backLink';
  onBackPress?: () => void;
  children: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
  bottomInsetExtra?: number;
  keyboardAware?: boolean;
  keyboardExtraScrollHeight?: number;
  loadingOverlayVisible?: boolean;
  headerInfo?: {
    title: string;
    text: string;
    expanded: boolean;
    onToggle: () => void;
  };
  browLabelPress?: () => void;
  browLabelAccessory?: ReactNode;
  browLabelAccessoryAnimation?: {
    source: object | number;
    frames: [number, number];
    staticFrame?: number;
    progress?: number;
    size?: number;
    speed?: number;
    style?: object;
    colorFilters?: { keypath: string; color: string }[];
  };
}) {
  const navInsets = useNavigationInsets({ topExtra: 14 });
  const contentBottomInset = useBottomInset(bottomInsetExtra);
  const locale = useLocaleLayout();
  const refreshOverlayVisible = Boolean(refreshControl?.props?.refreshing);
  const overlayVisible = loadingOverlayVisible || refreshOverlayVisible;

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.screen}>
        <ScreenLoadingOverlay visible={overlayVisible} />
        {keyboardAware ? (
          <KeyboardView
            style={styles.scroll}
            refreshControl={refreshControl}
            extraScrollHeight={keyboardExtraScrollHeight}
            contentContainerStyle={[
              styles.content,
              { paddingTop: navInsets.top, paddingBottom: contentBottomInset },
            ]}
            bounces={Boolean(refreshControl)}
            alwaysBounceVertical={Boolean(refreshControl)}
          >
            <ScreenBrow
              label={eyebrow}
              variant={browVariant}
              onBackPress={onBackPress}
              onLabelPress={browLabelPress ?? headerInfo?.onToggle}
              labelAccessory={
                browLabelAccessory ??
                (headerInfo ? <InfoToggleIcon expanded={headerInfo.expanded} /> : undefined)
              }
              labelAccessoryAnimation={browLabelAccessoryAnimation}
              rtl={locale.isRTL}
            />
            {headerInfo?.expanded ? (
              <View style={styles.infoPanel}>
                <Text style={[styles.infoTitle, locale.textStart]}>{headerInfo.title}</Text>
                <Text style={[styles.infoText, locale.textStart]}>{headerInfo.text}</Text>
              </View>
            ) : null}
            {children}
          </KeyboardView>
        ) : (
          <ScrollView
            style={styles.scroll}
            refreshControl={refreshControl}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            contentContainerStyle={[
              styles.content,
              { paddingTop: navInsets.top, paddingBottom: contentBottomInset },
            ]}
            showsVerticalScrollIndicator={false}
            bounces={Boolean(refreshControl)}
            alwaysBounceVertical={Boolean(refreshControl)}
          >
            <ScreenBrow
              label={eyebrow}
              variant={browVariant}
              onBackPress={onBackPress}
              onLabelPress={browLabelPress ?? headerInfo?.onToggle}
              labelAccessory={
                browLabelAccessory ??
                (headerInfo ? <InfoToggleIcon expanded={headerInfo.expanded} /> : undefined)
              }
              labelAccessoryAnimation={browLabelAccessoryAnimation}
              rtl={locale.isRTL}
            />
            {headerInfo?.expanded ? (
              <View style={styles.infoPanel}>
                <Text style={[styles.infoTitle, locale.textStart]}>{headerInfo.title}</Text>
                <Text style={[styles.infoText, locale.textStart]}>{headerInfo.text}</Text>
              </View>
            ) : null}
            {children}
          </ScrollView>
        )}
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
  const locale = useLocaleLayout();
  return (
    <View style={styles.heroCard}>
      <Text style={[ui.eyebrow, locale.textStart]}>{eyebrow}</Text>
      <Text style={[styles.heroTitle, locale.textStart]}>{title}</Text>
      <Text style={[styles.heroBody, locale.textStart]}>{body}</Text>
      {children ? <View style={styles.heroChildren}>{children}</View> : null}
    </View>
  );
}

export function ProductStatGrid({
  items,
}: {
  items: { eyebrow: string; value: string; body: string }[];
}) {
  const locale = useLocaleLayout();
  return (
    <View style={styles.statGrid}>
      {items.map((item) => (
        <View key={`${item.eyebrow}-${item.value}`} style={styles.statCard}>
          <Text style={[ui.muted, locale.textStart]}>{item.eyebrow}</Text>
          <Text style={[styles.statValue, locale.textStart]}>{item.value}</Text>
          <Text style={[styles.statBody, locale.textStart]}>{item.body}</Text>
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
  const locale = useLocaleLayout();
  return (
    <View style={styles.sectionCard}>
      <Text style={[ui.sectionEyebrow, locale.textStart]}>{eyebrow}</Text>
      <Text style={[styles.sectionTitle, locale.textStart]}>{title}</Text>
      <View style={styles.sectionChildren}>{children}</View>
    </View>
  );
}

export function ProductBulletList({ items }: { items: string[] }) {
  const locale = useLocaleLayout();
  return (
    <View style={styles.bulletList}>
      {items.map((item) => (
        <View key={item} style={[styles.bulletRow, locale.row]}>
          <View style={styles.bulletDot} />
          <Text style={[styles.bulletText, locale.textStart]}>{item}</Text>
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
  const locale = useLocaleLayout();
  return (
    <Pressable onPress={onPrimaryPress} style={styles.routeCard}>
      <View style={[styles.routeTopRow, locale.rowBetween]}>
        <View style={[styles.routeCopy, locale.alignStart]}>
          <Text style={[ui.eyebrow, locale.textStart]}>{eyebrow}</Text>
          <Text style={[styles.routeTitle, locale.textStart]}>{title}</Text>
        </View>
        <View style={[styles.routeMeta, locale.alignEnd]}>
          {value ? <Text style={[styles.routeValue, locale.textStart]}>{value}</Text> : null}
          {icon ? (
            <MaterialCommunityIcons name={icon} size={22} color={colors.accent} />
          ) : (
            <MaterialCommunityIcons name="arrow-top-right" size={22} color={colors.accent} />
          )}
        </View>
      </View>

      <Text style={[styles.routeBody, locale.textStart]}>{body}</Text>

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
  const locale = useLocaleLayout();
  return (
    <View style={styles.splitStack}>
      {rows.map((row) => (
        <View
          key={`${row.eyebrow}-${row.title}`}
          style={[styles.splitCard, row.accent && styles.splitCardAccent]}
        >
          <Text style={[row.accent ? styles.splitEyebrowAccent : ui.sectionEyebrow, locale.textStart]}>
            {row.eyebrow}
          </Text>
          <Text style={[styles.splitTitle, locale.textStart]}>{row.title}</Text>
          <Text style={[styles.splitBody, locale.textStart]}>{row.body}</Text>
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
      <Text
        style={variant === 'primary' ? styles.primaryButtonText : styles.secondaryButtonText}
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.78}
      >
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

  infoPanel: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 10,
    marginBottom: 16,
  },

  infoTitle: {
    ...ui.bodyStrong,
  },

  infoText: {
    ...ui.body,
    lineHeight: 25,
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
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
    textAlign: 'center',
    alignSelf: 'stretch',
    flexShrink: 1,
  },

  secondaryButtonText: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
    textAlign: 'center',
    alignSelf: 'stretch',
    flexShrink: 1,
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
