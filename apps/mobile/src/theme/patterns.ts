import { StyleSheet } from 'react-native';
import { colors, fontFamilies, layout, radius } from './tokens';

export const patternIcons = {
  browBack: 15,
  browChevron: 14,
  browLinked: 12,
} as const;

export const patternHitSlop = {
  comfort: { top: 12, bottom: 12, left: 12, right: 12 },
} as const;

export const patternPress = {
  brow: 0.85,
} as const;

export const patterns = StyleSheet.create({
  textEyebrow: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontFamilies.display,
    textTransform: 'uppercase',
    letterSpacing: 0.45,
  },

  textSectionEyebrow: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontFamilies.display,
    textTransform: 'uppercase',
    letterSpacing: 0.45,
  },

  textTitleLg: {
    color: colors.white,
    fontSize: 30,
    lineHeight: 36,
    fontFamily: fontFamilies.display,
    letterSpacing: 0,
  },

  textTitleMd: {
    color: colors.white,
    fontSize: 24,
    lineHeight: 30,
    fontFamily: fontFamilies.display,
    letterSpacing: 0,
  },

  textTitleSm: {
    color: colors.white,
    fontSize: 19,
    lineHeight: 24,
    fontFamily: fontFamilies.displaySemi,
    letterSpacing: 0,
  },

  textLead: {
    color: colors.textSoft,
    fontSize: 17,
    lineHeight: 28,
  },

  textBody: {
    color: colors.textSoft,
    fontSize: 15,
    lineHeight: 25,
  },

  textAction: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 18,
    fontFamily: fontFamilies.displaySemi,
    letterSpacing: 0,
  },

  textButton: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 18,
    fontFamily: fontFamilies.displaySemi,
    letterSpacing: 0,
  },

  textHelperXs: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontFamilies.displaySemi,
  },

  textHelperSm: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fontFamilies.displaySemi,
  },

  textSubtleXs: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontFamilies.displaySemi,
  },

  textStrongSm: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: fontFamilies.display,
  },

  textStrongMd: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 18,
    fontFamily: fontFamilies.display,
  },

  textBlockTitle: {
    color: colors.white,
    fontSize: 16,
    lineHeight: 20,
    fontFamily: fontFamilies.displaySemi,
    letterSpacing: 0,
  },

  textCodeLabel: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontFamilies.displaySemi,
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },

  textCodeLine: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: fontFamilies.displaySemi,
    letterSpacing: 0,
  },

  textButtonOnAccent: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: fontFamilies.display,
    letterSpacing: 0,
  },

  textStatusXs: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fontFamilies.display,
    letterSpacing: 0.4,
  },

  textStatusSm: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontFamilies.display,
  },

  textStatusPositive: {
    color: colors.green,
  },

  textStatusNegative: {
    color: colors.red,
  },

  textStatusNeutral: {
    color: colors.textDim,
  },

  surfaceCardSoftMd: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10,
  },

  surfaceCardSoftSm: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
  },

  surfaceBoxDark: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.bg,
  },

  surfaceBoxDarkCompact: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 6,
  },

  surfaceBoxDarkStrong: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.bg,
  },

  surfaceSummaryAccent: {
    backgroundColor: 'rgba(255,105,0,0.06)',
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.md,
    padding: 16,
    gap: 8,
  },

  surfaceStubAccent: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: 'rgba(255,105,0,0.05)',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
  },

  surfaceAccentCtaRow: {
    minHeight: 54,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(255,105,0,0.08)',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  surfaceRowCompact: {
    minHeight: 56,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  surfaceRowStandard: {
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  surfaceWalletSelectRow: {
    minHeight: 86,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  surfaceWalletRowInactive: {
    borderColor: 'rgba(255,105,0,0.14)',
    backgroundColor: 'rgba(255,105,0,0.04)',
  },

  surfaceWalletRowActive: {
    borderColor: 'rgba(24,224,58,0.22)',
    backgroundColor: 'rgba(24,224,58,0.06)',
  },

  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  rowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  fieldHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  buttonPrimary: {
    minHeight: layout.buttonHeight,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },

  buttonSecondary: {
    minHeight: layout.buttonHeight,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },

  buttonIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  inputShell: {
    minHeight: layout.fieldHeight,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },

  inputShellValid: {
    borderColor: colors.lineStrong,
  },

  inputShellInvalid: {
    borderColor: colors.red,
  },

  browPlain: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 30,
  },

  browBack: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 30,
  },

  browBackLink: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 30,
  },

  browLinkIcon: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 30,
  },

  browLabel: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontFamilies.display,
    textTransform: 'uppercase',
    letterSpacing: 0.45,
  },

  browBackText: {
    color: colors.accent,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '400',
    letterSpacing: 0,
  },

  browRightTouch: {
    minHeight: 36,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },

  browLeftCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  rowLink: {
    minHeight: 56,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  rowExpand: {
    minHeight: 56,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  rowIcon: {
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },

  rowAction: {
    minHeight: 54,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(255,105,0,0.08)',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  rowWallet: {
    minHeight: 86,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,105,0,0.14)',
    backgroundColor: 'rgba(255,105,0,0.04)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  rowWalletActive: {
    borderColor: 'rgba(24,224,58,0.22)',
    backgroundColor: 'rgba(24,224,58,0.06)',
  },

  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },

  rowTextBlock: {
    flex: 1,
    gap: 4,
  },

  rowLabel: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 18,
    fontFamily: fontFamilies.displaySemi,
    letterSpacing: 0,
  },

  rowMeta: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontFamilies.displaySemi,
  },

  rowHint: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontFamilies.displaySemi,
  },

  rowValue: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: fontFamilies.display,
  },

  rowStatus: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fontFamilies.display,
    letterSpacing: 0.4,
  },

  rowStatusPositive: {
    color: colors.green,
  },

  rowStatusNegative: {
    color: colors.red,
  },

  rowStatusNeutral: {
    color: colors.textDim,
  },

  rowTitleInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },

  iconBoxMd: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
