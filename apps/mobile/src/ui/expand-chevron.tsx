import { OpenDownIcon, OpenLeftIcon, OpenRightIcon } from './ui-icons';

type ExpandChevronProps = {
  open: boolean;
  size?: number;
  rtl?: boolean;
};

export default function ExpandChevron({
  open,
  size = 18,
  rtl = false,
}: ExpandChevronProps) {
  if (open) {
    return <OpenDownIcon width={size} height={size} />;
  }

  return rtl ? <OpenLeftIcon width={size} height={size} /> : <OpenRightIcon width={size} height={size} />;
}
