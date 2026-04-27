import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

type FourteenWalletLoaderProps = {
  active: boolean;
  size?: number;
};

type Spring = {
  x: number;
  v: number;
};

type BarState = {
  main: Spring;
  trail1: Spring;
  trail2: Spring;
  opacityMain: Spring;
  opacityTrail1: Spring;
  opacityTrail2: Spring;
};

type VisualBar = {
  main: number;
  trail1: number;
  trail2: number;
  opacityMain: number;
  opacityTrail1: number;
  opacityTrail2: number;
};

type VisualState = {
  bar1: VisualBar;
  bar2: VisualBar;
  bar3: VisualBar;
};

type ExitSnapshot = {
  captured: boolean;
  bar1Y: number;
  bar2Y: number;
  bar3Y: number;
  bar1Opacity: number;
  bar2Opacity: number;
  bar3Opacity: number;
};

type Phase =
  | { kind: 'idle' }
  | { kind: 'entry'; startAt: number }
  | { kind: 'main'; startAt: number }
  | { kind: 'exit'; startAt: number };

const START = { bar1: 0, bar2: 0, bar3: 0 } as const;
const ENTRY_Y = { bar1: -980, bar3: 980 } as const;

const INITIAL_DELAY = 0;
const ENTRY_DURATION = 360;
const EXIT_DURATION = 240;

const BAR1_PATH = 'M 104.480003 47 L 104 319';
const BAR1_CAP =
  'M 83.997139 47.513885 C 83.997803 38.204559 90.574348 30.192169 99.704796 28.376617 C 108.83535 26.561096 117.976776 31.44809 121.538788 40.04895 C 125.100807 48.649811 122.091301 58.569 114.350647 63.74057 C 106.609993 68.91217 96.29406 67.895508 89.711746 61.312561 C 86.052391 57.65271 83.996773 52.689362 83.997139 47.513885 Z';

const BAR2_PATH = 'M 249.998886 182 L 250.999298 318';
const BAR2_TOP_CAP =
  'M 230.997131 182.513885 C 230.997803 173.204559 237.574356 165.192169 246.704788 163.376617 C 255.835342 161.561096 264.976776 166.44809 268.538788 175.04895 C 272.1008 183.649811 269.091309 193.569 261.350647 198.74057 C 253.610001 203.91217 243.294067 202.895508 236.711746 196.312561 C 233.052383 192.65271 230.99678 187.689362 230.997131 182.513885 Z';
const BAR2_BOTTOM_CAP =
  'M 230.997131 318.513855 C 230.997803 309.20459 237.574356 301.192139 246.704788 299.376617 C 255.835342 297.561096 264.976776 302.44809 268.538788 311.04895 C 272.1008 319.649841 269.091309 329.569 261.350647 334.740601 C 253.610001 339.91217 243.294067 338.895508 236.711746 332.312561 C 233.052383 328.65271 230.99678 323.689362 230.997131 318.513855 Z';

const BAR3_PATH = 'M 395.997894 182 L 395.519989 454';
const BAR3_CAP =
  'M 375.997131 454.513855 C 375.997803 445.20459 382.574341 437.192169 391.704803 435.376617 C 400.835358 433.561096 409.976776 438.44809 413.538788 447.04895 C 417.1008 455.649811 414.091309 465.569 406.350647 470.74057 C 398.609985 475.91217 388.294067 474.895508 381.711761 468.312561 C 378.052399 464.65271 375.996765 459.689362 375.997131 454.513855 Z';

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function easeInCubic(t: number) {
  return t * t * t;
}

function createSpring(initial: number): Spring {
  return { x: initial, v: 0 };
}

function stepSpring(spring: Spring, target: number, stiffness: number, damping: number, dt: number) {
  const force = (target - spring.x) * stiffness;
  spring.v += force * dt;
  spring.v *= Math.pow(damping, dt * 60);
  spring.x += spring.v * dt;
}

function createBarState(initialY: number): BarState {
  return {
    main: createSpring(initialY),
    trail1: createSpring(initialY),
    trail2: createSpring(initialY),
    opacityMain: createSpring(0),
    opacityTrail1: createSpring(0),
    opacityTrail2: createSpring(0),
  };
}

function createLoaderState() {
  return {
    bar1: createBarState(ENTRY_Y.bar1),
    bar2: createBarState(START.bar2),
    bar3: createBarState(ENTRY_Y.bar3),
  };
}

function captureVisual(state: ReturnType<typeof createLoaderState>): VisualState {
  return {
    bar1: {
      main: state.bar1.main.x,
      trail1: state.bar1.trail1.x,
      trail2: state.bar1.trail2.x,
      opacityMain: clamp(state.bar1.opacityMain.x, 0, 1),
      opacityTrail1: clamp(state.bar1.opacityTrail1.x, 0, 1),
      opacityTrail2: clamp(state.bar1.opacityTrail2.x, 0, 1),
    },
    bar2: {
      main: state.bar2.main.x,
      trail1: state.bar2.trail1.x,
      trail2: state.bar2.trail2.x,
      opacityMain: clamp(state.bar2.opacityMain.x, 0, 1),
      opacityTrail1: clamp(state.bar2.opacityTrail1.x, 0, 1),
      opacityTrail2: clamp(state.bar2.opacityTrail2.x, 0, 1),
    },
    bar3: {
      main: state.bar3.main.x,
      trail1: state.bar3.trail1.x,
      trail2: state.bar3.trail2.x,
      opacityMain: clamp(state.bar3.opacityMain.x, 0, 1),
      opacityTrail1: clamp(state.bar3.opacityTrail1.x, 0, 1),
      opacityTrail2: clamp(state.bar3.opacityTrail2.x, 0, 1),
    },
  };
}

function getMainCarrier(t: number) {
  const p1 = Math.sin(t * 2.65) * 0.5 + 0.5;
  const p2 = Math.sin(t * 2.65 + Math.PI * 0.72) * 0.5 + 0.5;
  const p3 = Math.sin(t * 2.65 + Math.PI * 1.34) * 0.5 + 0.5;

  return {
    bar1: lerp(0, 135, p1),
    bar2: lerp(-135, 135, p2),
    bar3: lerp(-154, 0, p3),
  };
}

export default function FourteenWalletLoader({
  active,
  size = 28,
}: FourteenWalletLoaderProps) {
  const [mounted, setMounted] = useState(active);
  const mountedRef = useRef(active);
  const stateRef = useRef(createLoaderState());
  const exitSnapshotRef = useRef<ExitSnapshot>({
    captured: false,
    bar1Y: 0,
    bar2Y: 0,
    bar3Y: 0,
    bar1Opacity: 1,
    bar2Opacity: 1,
    bar3Opacity: 1,
  });
  const phaseRef = useRef<Phase>(active ? { kind: 'entry', startAt: nowMs() } : { kind: 'idle' });
  const lastNowRef = useRef(nowMs());
  const rafRef = useRef<number | null>(null);
  const [visual, setVisual] = useState<VisualState>(() => captureVisual(stateRef.current));

  useEffect(() => {
    mountedRef.current = mounted;
  }, [mounted]);

  useEffect(() => {
    if (active) {
      stateRef.current = createLoaderState();
      exitSnapshotRef.current = {
        captured: false,
        bar1Y: 0,
        bar2Y: 0,
        bar3Y: 0,
        bar1Opacity: 1,
        bar2Opacity: 1,
        bar3Opacity: 1,
      };
      phaseRef.current = { kind: 'entry', startAt: nowMs() };
      lastNowRef.current = nowMs();
      setVisual(captureVisual(stateRef.current));
      setMounted(true);
      return;
    }

    if (!mountedRef.current) return;

    exitSnapshotRef.current = {
      captured: true,
      bar1Y: stateRef.current.bar1.main.x,
      bar2Y: stateRef.current.bar2.main.x,
      bar3Y: stateRef.current.bar3.main.x,
      bar1Opacity: clamp(stateRef.current.bar1.opacityMain.x, 0, 1),
      bar2Opacity: clamp(stateRef.current.bar2.opacityMain.x, 0, 1),
      bar3Opacity: clamp(stateRef.current.bar3.opacityMain.x, 0, 1),
    };
    phaseRef.current = { kind: 'exit', startAt: nowMs() };
    lastNowRef.current = nowMs();
  }, [active]);

  useEffect(() => {
    if (!mounted) return;

    const tick = (frameNow: number) => {
      const dt = clamp((frameNow - lastNowRef.current) / 1000, 0.001, 0.04);
      lastNowRef.current = frameNow;

      const phase = phaseRef.current;
      const current = stateRef.current;

      let targetY = {
        bar1: ENTRY_Y.bar1,
        bar2: START.bar2,
        bar3: ENTRY_Y.bar3,
      };

      let targetOpacity = {
        bar1: 0,
        bar2: 0,
        bar3: 0,
      };

      if (phase.kind === 'entry') {
        const elapsed = frameNow - phase.startAt;

        if (elapsed < INITIAL_DELAY) {
          targetY.bar1 = ENTRY_Y.bar1;
          targetY.bar2 = START.bar2;
          targetY.bar3 = ENTRY_Y.bar3;
        } else {
          const p = clamp((elapsed - INITIAL_DELAY) / ENTRY_DURATION, 0, 1);
          const e = easeOutCubic(p);

          targetY.bar1 = lerp(ENTRY_Y.bar1, START.bar1, e);
          targetY.bar2 = START.bar2;
          targetY.bar3 = lerp(ENTRY_Y.bar3, START.bar3, e);

          targetOpacity.bar1 = e;
          targetOpacity.bar2 = clamp((p - 0.12) / 0.88, 0, 1);
          targetOpacity.bar3 = e;

          if (p >= 1) {
            phaseRef.current = { kind: 'main', startAt: frameNow };
          }
        }
      } else if (phase.kind === 'main') {
        const t = (frameNow - phase.startAt) / 1000;
        const carrier = getMainCarrier(t);

        targetY.bar1 = carrier.bar1;
        targetY.bar2 = carrier.bar2;
        targetY.bar3 = carrier.bar3;

        targetOpacity.bar1 = 1;
        targetOpacity.bar2 = 1;
        targetOpacity.bar3 = 1;
      } else if (phase.kind === 'exit') {
        const snapshot = exitSnapshotRef.current;
        const p = clamp((frameNow - phase.startAt) / EXIT_DURATION, 0, 1);
        const e = easeInCubic(p);

        targetY.bar1 = lerp(snapshot.bar1Y, ENTRY_Y.bar1, e);
        targetY.bar2 = snapshot.bar2Y;
        targetY.bar3 = lerp(snapshot.bar3Y, ENTRY_Y.bar3, e);

        targetOpacity.bar1 = lerp(snapshot.bar1Opacity, 0, e);
        targetOpacity.bar2 = lerp(snapshot.bar2Opacity, 0, e);
        targetOpacity.bar3 = lerp(snapshot.bar3Opacity, 0, e);

        if (p >= 1) {
          setMounted(false);
          phaseRef.current = { kind: 'idle' };
          rafRef.current = null;
          return;
        }
      }

      stepSpring(current.bar1.main, targetY.bar1, 130, 0.79, dt);
      stepSpring(current.bar2.main, targetY.bar2, 120, 0.81, dt);
      stepSpring(current.bar3.main, targetY.bar3, 130, 0.79, dt);

      stepSpring(current.bar1.trail1, current.bar1.main.x, 84, 0.75, dt);
      stepSpring(current.bar1.trail2, current.bar1.trail1.x, 58, 0.69, dt);

      stepSpring(current.bar2.trail1, current.bar2.main.x, 78, 0.76, dt);
      stepSpring(current.bar2.trail2, current.bar2.trail1.x, 54, 0.7, dt);

      stepSpring(current.bar3.trail1, current.bar3.main.x, 84, 0.75, dt);
      stepSpring(current.bar3.trail2, current.bar3.trail1.x, 58, 0.69, dt);

      stepSpring(current.bar1.opacityMain, targetOpacity.bar1, 150, 0.78, dt);
      stepSpring(current.bar2.opacityMain, targetOpacity.bar2, 150, 0.78, dt);
      stepSpring(current.bar3.opacityMain, targetOpacity.bar3, 150, 0.78, dt);

      stepSpring(current.bar1.opacityTrail1, current.bar1.opacityMain.x * 0.32, 120, 0.74, dt);
      stepSpring(current.bar1.opacityTrail2, current.bar1.opacityMain.x * 0.13, 100, 0.7, dt);

      stepSpring(current.bar2.opacityTrail1, current.bar2.opacityMain.x * 0.25, 120, 0.74, dt);
      stepSpring(current.bar2.opacityTrail2, current.bar2.opacityMain.x * 0.1, 100, 0.7, dt);

      stepSpring(current.bar3.opacityTrail1, current.bar3.opacityMain.x * 0.32, 120, 0.74, dt);
      stepSpring(current.bar3.opacityTrail2, current.bar3.opacityMain.x * 0.13, 100, 0.7, dt);

      setVisual(captureVisual(current));
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [mounted]);

  const containerStyle = useMemo(() => {
    return {
      width: size,
      height: size,
    };
  }, [size]);

  if (!mounted) return null;

  return (
    <View style={[styles.root, containerStyle]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 500 500">
        <BarOne y={visual.bar1.trail2} opacity={visual.bar1.opacityTrail2} tone="soft" />
        <BarOne y={visual.bar1.trail1} opacity={visual.bar1.opacityTrail1} tone="mid" />
        <BarOne y={visual.bar1.main} opacity={visual.bar1.opacityMain} tone="main" />

        <BarTwo y={visual.bar2.trail2} opacity={visual.bar2.opacityTrail2} tone="soft" />
        <BarTwo y={visual.bar2.trail1} opacity={visual.bar2.opacityTrail1} tone="mid" />
        <BarTwo y={visual.bar2.main} opacity={visual.bar2.opacityMain} tone="main" />

        <BarThree y={visual.bar3.trail2} opacity={visual.bar3.opacityTrail2} tone="soft" />
        <BarThree y={visual.bar3.trail1} opacity={visual.bar3.opacityTrail1} tone="mid" />
        <BarThree y={visual.bar3.main} opacity={visual.bar3.opacityMain} tone="main" />
      </Svg>
    </View>
  );
}

function BarOne({ y, opacity, tone }: RenderBarProps) {
  return (
    <G transform={`translate(0 ${y})`} opacity={opacity}>
      <Path
        d={BAR1_PATH}
        fill="none"
        stroke={getStrokeColor(tone)}
        strokeWidth={75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d={BAR1_CAP} fill="#f2f2f2" />
    </G>
  );
}

function BarTwo({ y, opacity, tone }: RenderBarProps) {
  return (
    <G transform={`translate(0 ${y})`} opacity={opacity}>
      <Path
        d={BAR2_PATH}
        fill="none"
        stroke={getStrokeColor(tone)}
        strokeWidth={75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d={BAR2_TOP_CAP} fill="#f2f2f2" />
      <Path d={BAR2_BOTTOM_CAP} fill="#f2f2f2" />
    </G>
  );
}

function BarThree({ y, opacity, tone }: RenderBarProps) {
  return (
    <G transform={`translate(0 ${y})`} opacity={opacity}>
      <Path
        d={BAR3_PATH}
        fill="none"
        stroke={getStrokeColor(tone)}
        strokeWidth={75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d={BAR3_CAP} fill="#f2f2f2" />
    </G>
  );
}

type RenderBarProps = {
  y: number;
  opacity: number;
  tone: 'soft' | 'mid' | 'main';
};

function getStrokeColor(tone: RenderBarProps['tone']) {
  if (tone === 'soft') return 'rgba(255,105,0,0.22)';
  if (tone === 'mid') return 'rgba(255,105,0,0.55)';
  return '#ff6900';
}

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
