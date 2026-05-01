import { StyleSheet } from 'react-native';
import { colors, fontFamilies } from './tokens';

export const ui = StyleSheet.create({
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontFamilies.display,
    textTransform: 'uppercase',
    letterSpacing: 0.45,
  },

  sectionEyebrow: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontFamilies.display,
    textTransform: 'uppercase',
    letterSpacing: 0.45,
  },

  submenuBackText: {
    color: colors.accent,
    fontSize: 15,
    lineHeight: 18,
  },

  titleXl: {
    color: colors.white,
    fontSize: 34,
    lineHeight: 40,
    fontFamily: fontFamilies.display,
    letterSpacing: 0,
  },

  titleLg: {
    color: colors.white,
    fontSize: 30,
    lineHeight: 36,
    fontFamily: fontFamilies.display,
    letterSpacing: 0,
  },

  titleMd: {
    color: colors.white,
    fontSize: 24,
    lineHeight: 30,
    fontFamily: fontFamilies.display,
    letterSpacing: 0,
  },

  titleSm: {
    color: colors.white,
    fontSize: 19,
    lineHeight: 24,
    fontFamily: fontFamilies.displaySemi,
    letterSpacing: 0,
  },

  lead: {
    color: colors.textSoft,
    fontSize: 17,
    lineHeight: 28,
  },

  body: {
    color: colors.textSoft,
    fontSize: 15,
    lineHeight: 25,
  },

  bodyStrong: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fontFamilies.displaySemi,
  },

  helper: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fontFamilies.displaySemi,
  },

  muted: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontFamilies.displaySemi,
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },

  actionLabel: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 18,
    fontFamily: fontFamilies.displaySemi,
    letterSpacing: 0,
  },

  buttonLabel: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 18,
    fontFamily: fontFamilies.displaySemi,
    letterSpacing: 0,
  },

  versionLine: {
    color: colors.lightCool,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: fontFamilies.displaySemi,
    letterSpacing: 0.25,
    textTransform: 'uppercase',
  },

  socialLabel: {
    color: colors.white,
    fontSize: 9,
    lineHeight: 11,
    textAlign: 'center',
    fontFamily: fontFamilies.displaySemi,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },

  tocLabel: {
    color: colors.textSoft,
    fontSize: 15,
    lineHeight: 22,
  },

  code: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 22,
  },
});
