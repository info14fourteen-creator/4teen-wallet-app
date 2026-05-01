import { useEffect, useRef, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import LottieView from 'lottie-react-native';

type LottieColorFilter = {
  keypath: string;
  color: string;
};

type LottieIconProps = {
  source: object | number;
  size?: number;
  playToken?: number;
  frames?: [number, number];
  progress?: number;
  staticFrame?: number;
  loop?: boolean;
  speed?: number;
  style?: StyleProp<ViewStyle>;
  colorFilters?: LottieColorFilter[];
  onAnimationFinish?: (isCancelled: boolean) => void;
};

export default function LottieIcon({
  source,
  size = 24,
  playToken = 0,
  frames,
  progress,
  staticFrame,
  loop = false,
  speed = 1,
  style,
  colorFilters,
  onAnimationFinish,
}: LottieIconProps) {
  const ref = useRef<LottieView>(null);
  const previousPlayTokenRef = useRef(0);
  const [staticFrameReady, setStaticFrameReady] = useState(typeof staticFrame !== 'number');

  useEffect(() => {
    if (!playToken || playToken === previousPlayTokenRef.current) {
      return;
    }

    previousPlayTokenRef.current = playToken;
    ref.current?.reset();

    if (frames) {
      ref.current?.play(frames[0], frames[1]);
      return;
    }

    ref.current?.play();
  }, [frames, playToken]);

  useEffect(() => {
    if (typeof staticFrame !== 'number') {
      setStaticFrameReady(true);
      return;
    }

    setStaticFrameReady(false);
    ref.current?.reset();
    ref.current?.play(staticFrame, staticFrame);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setStaticFrameReady(true);
      });
    });
  }, [source, staticFrame]);

  return (
    <LottieView
      ref={ref}
      source={source as any}
      autoPlay={false}
      loop={loop}
      onAnimationFinish={onAnimationFinish}
      progress={typeof staticFrame === 'number' ? undefined : progress}
      speed={speed}
      colorFilters={colorFilters}
      style={[
        { width: size, height: size, opacity: typeof staticFrame === 'number' && !staticFrameReady ? 0 : 1 },
        style,
      ]}
    />
  );
}
