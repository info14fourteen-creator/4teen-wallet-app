import React from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
} from 'react-native-keyboard-aware-scroll-view';

type KeyboardViewProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  extraScrollHeight?: number;
} & Omit<KeyboardAwareScrollViewProps, 'contentContainerStyle' | 'style'>;

export default function KeyboardView({
  children,
  style,
  contentContainerStyle,
  extraScrollHeight = 42,
  keyboardShouldPersistTaps = 'handled',
  keyboardDismissMode = 'interactive',
  showsVerticalScrollIndicator = false,
  bounces = true,
  ...rest
}: KeyboardViewProps) {
  return (
    <KeyboardAwareScrollView
      style={[styles.container, style]}
      contentContainerStyle={[styles.content, contentContainerStyle]}
      enableOnAndroid
      enableAutomaticScroll
      extraScrollHeight={extraScrollHeight}
      extraHeight={extraScrollHeight}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode={keyboardDismissMode}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      bounces={bounces}
      {...rest}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'flex-start',
  },
});
