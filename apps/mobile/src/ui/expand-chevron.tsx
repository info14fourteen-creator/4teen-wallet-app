import { OpenDownIcon, OpenRightIcon } from './ui-icons';

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
