type BalanceDirection = 'owed' | 'owing';

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
    className={`group-avatar ${color} ${size}${balanceDirection ? ` balance-${balanceDirection}` : ''}`}
    aria-label={balanceLabel}
  >{photo ? <img src={photo} alt="" /> : name.trim().charAt(0).toUpperCase() || '?'}</span>;
}
