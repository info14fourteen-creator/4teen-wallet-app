import { useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

export function useSwipeDownDismiss(onDismiss: () => void, threshold = 42) {
  return useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(12)
        .failOffsetX([-24, 24])
        .onEnd((event) => {
          if (event.translationY >= threshold) {
            runOnJS(onDismiss)();
          }
        }),
    [onDismiss, threshold]
  );
}
