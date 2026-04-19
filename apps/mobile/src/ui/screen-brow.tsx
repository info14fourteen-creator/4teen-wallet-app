import type { ReactNode } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { colors } from '../theme/tokens';
import {
  patterns,
  patternHitSlop,
  patternIcons,
  patternPress,
} from '../theme/patterns';

import OpenRightIcon from '../../assets/icons/ui/open_right_btn.svg';

type ScreenBrowVariant = 'plain' | 'back' | 'backLink' | 'linkIcon';

type ScreenBrowProps = {
  label: string;
  variant?: ScreenBrowVariant;
  onBackPress?: () => void;
  rightIcon?: ReactNode;
  onRightPress?: () => void;
  onLabelPress?: () => void;
};

export default function ScreenBrow({
  label,
  variant = 'plain',
  onBackPress,
  rightIcon,
  onRightPress,
  onLabelPress,
}: ScreenBrowProps) {
  const router = useRouter();

  const handleBackPress = () => {
    onBackPress?.();
    if (!onBackPress) {
      router.back();
    }
  };

  if (variant === 'plain') {
    return (
      <View style={patterns.browPlain}>
        <Text style={patterns.browLabel}>{label}</Text>
      </View>
    );
  }

  if (variant === 'back') {
    return (
      <View style={patterns.browBack}>
        <Text style={patterns.browLabel}>{label}</Text>
        <BackAction onPress={handleBackPress} />
      </View>
    );
  }

  if (variant === 'backLink') {
    const labelNode = (
      <View style={patterns.browLeftCluster}>
        <Text style={patterns.browLabel}>{label}</Text>
        <OpenRightIcon width={patternIcons.browChevron} height={patternIcons.browChevron} />
      </View>
    );

    return (
      <View style={patterns.browBackLink}>
        {onLabelPress ? (
          <TouchableOpacity
            activeOpacity={patternPress.brow}
            hitSlop={patternHitSlop.comfort}
            onPress={onLabelPress}
          >
            {labelNode}
          </TouchableOpacity>
        ) : (
          labelNode
        )}
        <BackAction onPress={handleBackPress} />
      </View>
    );
  }

  const labelNode = (
    <View style={patterns.browLeftCluster}>
      <Text style={patterns.browLabel}>{label}</Text>
      <OpenRightIcon width={patternIcons.browChevron} height={patternIcons.browChevron} />
    </View>
  );

  return (
    <View style={patterns.browLinkIcon}>
      {onLabelPress ? (
        <TouchableOpacity
          activeOpacity={patternPress.brow}
          hitSlop={patternHitSlop.comfort}
          onPress={onLabelPress}
        >
          {labelNode}
        </TouchableOpacity>
      ) : (
        labelNode
      )}
      <TouchableOpacity
        activeOpacity={patternPress.brow}
        style={patterns.browRightTouch}
        hitSlop={patternHitSlop.comfort}
        onPress={onRightPress}
      >
        {rightIcon}
      </TouchableOpacity>
    </View>
  );
}

function BackAction({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      activeOpacity={patternPress.brow}
      style={patterns.browRightTouch}
      hitSlop={patternHitSlop.comfort}
      onPress={onPress}
    >
      <Ionicons name="arrow-back" size={patternIcons.browBack} color={colors.accent} />
      <Text style={patterns.browBackText}>back</Text>
    </TouchableOpacity>
  );
}
