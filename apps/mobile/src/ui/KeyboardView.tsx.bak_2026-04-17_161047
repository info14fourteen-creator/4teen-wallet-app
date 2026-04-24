import React from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';

type KeyboardViewProps = {
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  extraScrollHeight?: number;
};

export default function KeyboardView({
  children,
  contentContainerStyle,
  extraScrollHeight = 42,
}: KeyboardViewProps) {
  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, contentContainerStyle]}
      enableOnAndroid
      enableAutomaticScroll
      extraScrollHeight={extraScrollHeight}
      extraHeight={extraScrollHeight}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      bounces
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
