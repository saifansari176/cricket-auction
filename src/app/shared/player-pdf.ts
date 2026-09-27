import type { Player } from '../core/models/player';
import { loadPlayerThumbnail } from './player-excel';

/** Generate real PDF bytes from the loaded list, including Unicode names. */
export async function createPlayerPdf(title: string, players: Player[]): Promise<{
  bytes: Uint8Array<ArrayBuffer>; missingPhotos: number;
}> {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${title} - Player Catalogue`);
  let missingPhotos = 0;
  const timestamp = new Date().toLocaleString();
  const pageCount = Math.max(1, Math.ceil(players.length / 10));
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const canvas = document.createElement('canvas');
    canvas.width = 1240;
    canvas.height = 1754;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('PDF rendering unavailable');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#14243a';
    context.font = 'bold 32px Arial';
    context.fillText(title, 50, 60, 1140);
    context.font = '20px Arial';
    context.fillText(`${players.length} players | ${timestamp}`, 50, 98, 1140);
    const group = players.slice(pageIndex * 10, pageIndex * 10 + 10);
    const photos = await Promise.all(group.map(async player => {
      if (!player.photo) return null;
      try {
        const data = await loadPlayerThumbnail(player.photo);
        const image = new Image();
        image.src = data;
        await image.decode();
        return image;
      } catch {
        missingPhotos++;
        return null;
      }
    }));
    group.forEach((player, index) => {
      const x = 50 + (index % 2) * 580;
      const y = 140 + Math.floor(index / 2) * 302;
      context.strokeStyle = '#bbc7d5';
      context.strokeRect(x, y, 560, 280);
      if (photos[index]) context.drawImage(photos[index]!, x + 14, y + 38, 150, 180);
      else {
        context.fillStyle = '#586579';
        context.font = '18px Arial';
        context.fillText('No photo', x + 25, y + 130);
      }
      const lines = [
        `${player.firstName} ${player.lastName}`,
        player.playerType || 'Player',
        `Category: ${player.categoryName || 'Regular'}`,
        `Jersey: ${player.jerseyNumber || '-'}`,
        `Status: ${player.status || '-'}`
      ];
      lines.forEach((line, lineIndex) => {
        context.fillStyle = '#14243a';
        context.font = lineIndex === 0 ? 'bold 24px Arial' : '21px Arial';
        context.fillText(line, x + 180, y + 50 + lineIndex * 42, 365);
      });
    });
    context.fillStyle = '#586579';
    context.font = '18px Arial';
    context.fillText(`Page ${pageIndex + 1} of ${pageCount} | Snapshot only; later changes are not included.`, 50, 1710);
    const image = await pdf.embedPng(canvas.toDataURL('image/png'));
    const page = pdf.addPage([595.28, 841.89]);
    page.drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 });
    canvas.width = canvas.height = 0;
  }
  return { bytes: new Uint8Array(await pdf.save()), missingPhotos };
}
