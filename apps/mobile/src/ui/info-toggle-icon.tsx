import { useEffect, useRef, useState } from 'react';

import LottieIcon from './lottie-icon';

const INFO_ARROW_SOURCE = require('../../assets/icons/ui/connections_info_arrow_down.json');
const INFO_CROSS_SOURCE = require('../../assets/icons/ui/connections_info_cross.json');
const INFO_ARROW_FRAMES: [number, number] = [0, 59];
const INFO_CROSS_FRAMES: [number, number] = [0, 58];

type InfoToggleIconState = 'closed-static' | 'opening' | 'open-static' | 'closing';

export default function InfoToggleIcon({
  expanded,
  size = 16,
}: {
  expanded: boolean;
  size?: number;
}) {
  const previousExpandedRef = useRef(expanded);
  const [playToken, setPlayToken] = useState(0);
  const [state, setState] = useState<InfoToggleIconState>(
    expanded ? 'open-static' : 'closed-static'
  );

  useEffect(() => {
    if (previousExpandedRef.current === expanded) {
      return;
    }

    previousExpandedRef.current = expanded;
    setState(expanded ? 'opening' : 'closing');
    setPlayToken((value) => value + 1);
  }, [expanded]);

  if (state === 'opening') {
    return (
      <LottieIcon
        key={`info-toggle-opening-${playToken}`}
        source={INFO_ARROW_SOURCE}
        size={size}
        playToken={playToken}
        frames={INFO_ARROW_FRAMES}
        speed={1.2}
        onAnimationFinish={(isCancelled) => {
          if (!isCancelled) {
            setState((current) => (current === 'opening' ? 'open-static' : current));
          }
        }}
      />
    );
  }

  if (state === 'closing') {
    return (
      <LottieIcon
        key={`info-toggle-closing-${playToken}`}
        source={INFO_CROSS_SOURCE}
        size={size}
        playToken={playToken}
        frames={INFO_CROSS_FRAMES}
        speed={1.2}
        onAnimationFinish={(isCancelled) => {
          if (!isCancelled) {
            setState((current) => (current === 'closing' ? 'closed-static' : current));
          }
        }}
      />
    );
  }

  if (state === 'open-static') {
    return <LottieIcon key="info-toggle-open-static" source={INFO_CROSS_SOURCE} size={size} progress={1} />;
  }

  return <LottieIcon key="info-toggle-closed-static" source={INFO_ARROW_SOURCE} size={size} progress={1} />;
}
