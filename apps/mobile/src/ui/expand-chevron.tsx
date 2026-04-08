import OpenDownIcon from '../../assets/icons/ui/open_down_btn.svg';
import OpenRightIcon from '../../assets/icons/ui/open_right_btn.svg';

type ExpandChevronProps = {
  open: boolean;
  size?: number;
};

export default function ExpandChevron({
  open,
  size = 18,
}: ExpandChevronProps) {
  if (open) {
    return <OpenDownIcon width={size} height={size} />;
  }

  return <OpenRightIcon width={size} height={size} />;
}
