export default function Avatar({ name, color = 'mint', photo, size = 'normal' }: { name: string; color?: string; photo?: string | null; size?: 'normal' | 'large' }) {
  return <span className={`group-avatar ${color} ${size}`}>{photo ? <img src={photo} alt="" /> : name.trim().charAt(0).toUpperCase() || '?'}</span>;
}

