type BalanceDirection = 'owed' | 'owing';

/** Match the photo endpoint's default so refreshing a group never changes its avatar. */
export function GroupAvatar(props: Parameters<typeof Avatar>[0]) {
  const letter = (props.name.trim().charAt(0).toUpperCase() || '?').replace(/[<>&"']/g, '');
  const placeholder = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="40" fill="#dcebe3"/><text x="40" y="51" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#254638">${letter}</text></svg>`)}`;
  return <Avatar {...props} photo={props.photo || placeholder} />;
}

export default function Avatar({
  name,
  color = 'mint',
  photo,
  size = 'normal',
  balanceDirection,
}: {
  name: string;
  color?: string;
  photo?: string | null;
  size?: 'normal' | 'large';
  balanceDirection?: BalanceDirection;
}) {
  const balanceLabel = balanceDirection === 'owed'
    ? `${name}: you are owed money`
    : balanceDirection === 'owing'
      ? `${name}: you owe money`
      : undefined;

  return <span
    className={`group-avatar ${color} ${size}${photo ? ' has-photo' : ''}${balanceDirection ? ` balance-${balanceDirection}` : ''}`}
    aria-label={balanceLabel}
  >{photo ? <img src={photo} alt="" /> : name.trim().charAt(0).toUpperCase() || '?'}</span>;
}
