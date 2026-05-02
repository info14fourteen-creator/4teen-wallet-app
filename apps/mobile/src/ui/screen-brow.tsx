import { useState, type ReactNode } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';

import { colors } from '../theme/tokens';
import { goBackOrReplace } from './safe-back';
import LottieIcon from './lottie-icon';
import {
  patterns,
  patternHitSlop,
  patternIcons,
  patternPress,
} from '../theme/patterns';

const BROW_BACK_ARROW_SOURCE = require('../../assets/icons/ui/brow_back_arrow_slide.json');
const BROW_BACK_ARROW_FRAMES: [number, number] = [0, 59];
const BROW_BACK_ARROW_STATIC_PROGRESS = 1;

type ScreenBrowVariant = 'plain' | 'back' | 'backLink' | 'linkIcon';

type BrowAnimatedIconConfig = {
  source: object | number;
  frames: [number, number];
  staticFrame?: number;
  progress?: number;
  size?: number;
  speed?: number;
  style?: object;
  colorFilters?: { keypath: string; color: string }[];
};

type ScreenBrowProps = {
  label: string;
  variant?: ScreenBrowVariant;
  onBackPress?: () => void;
  backAction?: ReactNode;
  rightIcon?: ReactNode;
  onRightPress?: () => void;
  onLabelPress?: () => void;
  labelChevron?: 'right' | 'down' | 'up';
  labelAccessory?: ReactNode;
  labelAccessoryAnimation?: BrowAnimatedIconConfig;
  backAccessory?: ReactNode;
  backLabel?: string | null;
  rightIconAnimation?: BrowAnimatedIconConfig;
};

function renderLabelAccessory({
  labelAccessory,
  variant,
  defaultChevronName,
}: {
  labelAccessory?: ReactNode;
  variant: ScreenBrowVariant;
  defaultChevronName: 'chevron-right' | 'chevron-down' | 'chevron-up';
}) {
  if (labelAccessory !== undefined) {
    return labelAccessory;
  }

  if (variant !== 'backLink' && variant !== 'linkIcon') {
    return null;
  }

  return (
    <MaterialCommunityIcons
      name={defaultChevronName}
      size={patternIcons.browChevron}
      color={colors.accent}
    />
  );
}

export default function ScreenBrow({
  label,
  variant = 'plain',
  onBackPress,
  backAction,
  rightIcon,
  onRightPress,
  onLabelPress,
  labelChevron = 'right',
  labelAccessory,
  labelAccessoryAnimation,
  backAccessory,
  backLabel = null,
  rightIconAnimation,
}: ScreenBrowProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [labelPlayToken, setLabelPlayToken] = useState(0);
  const [labelAnimating, setLabelAnimating] = useState(false);
  const [rightPlayToken, setRightPlayToken] = useState(0);
  const [rightAnimating, setRightAnimating] = useState(false);

  const handleBackPress = () => {
    onBackPress?.();
    if (!onBackPress) {
      goBackOrReplace(router, { pathname });
    }
  };

  const defaultChevronName =
    labelChevron === 'down'
      ? 'chevron-down'
      : labelChevron === 'up'
        ? 'chevron-up'
        : 'chevron-right';

  const baseLabelNode = (
    <View style={patterns.browLeftCluster}>
      <Text style={patterns.browLabel}>{label}</Text>
      {renderLabelAccessory({ labelAccessory, variant, defaultChevronName })}
    </View>
  );

  const labelNode = onLabelPress ? (
    <TouchableOpacity
      activeOpacity={patternPress.brow}
      hitSlop={patternHitSlop.comfort}
      onPress={() => {
        if (labelAccessoryAnimation) {
          if (labelAnimating) {
            return;
          }

          setLabelAnimating(true);
          setLabelPlayToken((value) => value + 1);
          return;
        }

        onLabelPress();
      }}
    >
      <View style={patterns.browLeftCluster}>
        <Text style={patterns.browLabel}>{label}</Text>
        {labelAccessoryAnimation ? (
          labelAnimating ? (
            <LottieIcon
              key={`brow-label-animated-${labelPlayToken}`}
              source={labelAccessoryAnimation.source}
              size={labelAccessoryAnimation.size ?? 18}
              playToken={labelPlayToken}
              frames={labelAccessoryAnimation.frames}
              speed={labelAccessoryAnimation.speed ?? 1.35}
              style={labelAccessoryAnimation.style as any}
              colorFilters={labelAccessoryAnimation.colorFilters}
              onAnimationFinish={(isCancelled) => {
                setLabelAnimating(false);

                if (!isCancelled) {
                  onLabelPress();
                }
              }}
            />
          ) : (
            <LottieIcon
              source={labelAccessoryAnimation.source}
              size={labelAccessoryAnimation.size ?? 18}
              staticFrame={labelAccessoryAnimation.staticFrame}
              progress={labelAccessoryAnimation.progress}
              style={labelAccessoryAnimation.style as any}
              colorFilters={labelAccessoryAnimation.colorFilters}
            />
          )
        ) : (
          renderLabelAccessory({ labelAccessory, variant, defaultChevronName })
        )}
      </View>
    </TouchableOpacity>
  ) : (
    labelAccessoryAnimation ? (
      <View style={patterns.browLeftCluster}>
        <Text style={patterns.browLabel}>{label}</Text>
        <LottieIcon
          source={labelAccessoryAnimation.source}
          size={labelAccessoryAnimation.size ?? 18}
          staticFrame={labelAccessoryAnimation.staticFrame}
          progress={labelAccessoryAnimation.progress}
          style={labelAccessoryAnimation.style as any}
          colorFilters={labelAccessoryAnimation.colorFilters}
        />
      </View>
    ) : (
      baseLabelNode
    )
  );

  if (variant === 'plain') {
    return (
      <View style={patterns.browPlain}>
        {labelNode}
      </View>
    );
  }

  if (variant === 'back') {
    return (
      <View style={patterns.browBack}>
        {labelNode}
        {backAction || (
          <BackAction onPress={handleBackPress} accessory={backAccessory} label={backLabel} />
        )}
      </View>
    );
  }

  if (variant === 'backLink') {
    return (
      <View style={patterns.browBackLink}>
        {labelNode}
        {backAction || (
          <BackAction onPress={handleBackPress} accessory={backAccessory} label={backLabel} />
        )}
      </View>
    );
  }

  return (
    <View style={patterns.browLinkIcon}>
      {labelNode}
      <TouchableOpacity
        activeOpacity={patternPress.brow}
        style={patterns.browRightTouch}
        hitSlop={patternHitSlop.comfort}
        onPress={() => {
          if (rightIconAnimation && onRightPress) {
            if (rightAnimating) {
              return;
            }

            setRightAnimating(true);
            setRightPlayToken((value) => value + 1);
            return;
          }

          onRightPress?.();
        }}
      >
        {rightIconAnimation ? (
          rightAnimating ? (
            <LottieIcon
              key={`brow-right-animated-${rightPlayToken}`}
              source={rightIconAnimation.source}
              size={rightIconAnimation.size ?? 18}
              playToken={rightPlayToken}
              frames={rightIconAnimation.frames}
              speed={rightIconAnimation.speed ?? 1.35}
              style={rightIconAnimation.style as any}
              colorFilters={rightIconAnimation.colorFilters}
              onAnimationFinish={(isCancelled) => {
                setRightAnimating(false);

                if (!isCancelled) {
                  onRightPress?.();
                }
              }}
            />
          ) : (
            <LottieIcon
              source={rightIconAnimation.source}
              size={rightIconAnimation.size ?? 18}
              staticFrame={rightIconAnimation.staticFrame}
              progress={rightIconAnimation.progress}
              style={rightIconAnimation.style as any}
              colorFilters={rightIconAnimation.colorFilters}
            />
          )
        ) : (
          rightIcon
        )}
      </TouchableOpacity>
    </View>
  );
}

function BackAction({
  onPress,
  accessory,
  label,
}: {
  onPress: () => void;
  accessory?: ReactNode;
  label?: string | null;
}) {
  const [playToken, setPlayToken] = useState(0);
  const [animating, setAnimating] = useState(false);

  return (
    <TouchableOpacity
      activeOpacity={patternPress.brow}
      style={patterns.browRightTouch}
      hitSlop={patternHitSlop.comfort}
      onPress={() => {
        if (animating) {
          return;
        }

        setAnimating(true);
        setPlayToken((value) => value + 1);
      }}
    >
      {animating ? (
        <LottieIcon
          key={`brow-back-animated-${playToken}`}
          source={BROW_BACK_ARROW_SOURCE}
          size={18}
          playToken={playToken}
          frames={BROW_BACK_ARROW_FRAMES}
          speed={1.35}
          style={{ transform: [{ scaleX: -1 }] }}
          onAnimationFinish={(isCancelled) => {
            setAnimating(false);

            if (!isCancelled) {
              onPress();
            }
          }}
        />
      ) : accessory ? (
        accessory
      ) : (
        <LottieIcon
          source={BROW_BACK_ARROW_SOURCE}
          size={18}
          progress={BROW_BACK_ARROW_STATIC_PROGRESS}
          style={{ transform: [{ scaleX: -1 }] }}
        />
      )}
      {label ? <Text style={patterns.browBackText}>{label}</Text> : null}
    </TouchableOpacity>
  );
}
