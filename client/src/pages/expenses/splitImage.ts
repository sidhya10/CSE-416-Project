import { formatCents, type PreviewSplit, type SplitMember } from './split';

// Render locally: no receipt photos, remote fonts, storage, or network requests.
export async function createSplitImage(split: PreviewSplit, members: SplitMember[]): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image creation is unavailable in this browser.');
  const name = (id: string) => members.find(member => member.id === id)?.name ?? 'Participant';
  const payer = name(split.payerId);
  const own = split.shares.find(share => share.memberId === split.payerId);
  const blocks = [
    { text: split.name, size: 30, bold: true, color: '#192923' },
    { text: `Receipt total: ${formatCents(split.totalCents)}`, size: 26, bold: true, color: '#207459' },
    { text: `${payer} paid the bill.`, size: 22, bold: false, color: '#192923' },
    { text: `${payer}’s own share: ${formatCents(own?.totalCents ?? 0)}`, size: 20, bold: false, color: '#53675d' },
    { text: 'WHO OWES WHAT', size: 16, bold: true, color: '#207459' },
    ...split.shares.filter(share => share.memberId !== split.payerId).map(share => ({
      text: `${name(share.memberId)} → ${payer}: ${formatCents(share.reimbursementCents)}`,
      size: 22, bold: true, color: '#192923',
    })),
  ];
  const rows = blocks.map(block => {
    ctx.font = `${block.bold ? '600' : '400'} ${block.size}px system-ui, sans-serif`;
    const lines: string[] = [];
    let line = '';
    // Character wrapping also handles long names with no spaces.
    for (const character of block.text) {
      if (line && ctx.measureText(line + character).width > 536) { lines.push(line); line = ''; }
      line += character;
    }
    if (line) lines.push(line);
    return { ...block, lines, height: lines.length * (block.size + 10) + 24 };
  });
  const height = 146 + rows.reduce((sum, row) => sum + row.height, 0);
  canvas.width = 1240; canvas.height = height * 2;
  ctx.scale(2, 2);
  ctx.fillStyle = '#f6f4ed'; ctx.fillRect(0, 0, 620, height);
  ctx.fillStyle = '#207459'; ctx.fillRect(0, 0, 620, 96);
  ctx.fillStyle = '#ffffff'; ctx.font = '700 32px system-ui, sans-serif'; ctx.fillText('Divvy', 42, 60);
  ctx.textAlign = 'right'; ctx.font = '16px system-ui, sans-serif'; ctx.fillText('QUICK SPLIT', 578, 58); ctx.textAlign = 'left';
  let y = 136;
  for (const row of rows) {
    ctx.fillStyle = row.color;
    ctx.font = `${row.bold ? '600' : '400'} ${row.size}px system-ui, sans-serif`;
    for (const line of row.lines) { ctx.fillText(line, 42, y + row.size); y += row.size + 10; }
    y += 24;
  }
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create the image.')), 'image/png'));
}
