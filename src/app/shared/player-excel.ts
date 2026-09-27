import type { Player } from '../core/models/player';

/** Embed small thumbnails instead of full-resolution originals. */
export function loadPlayerThumbnail(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => finish(new Error('Photo timed out')), 15000);
    const finish = (error?: Error, data?: string) => {
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      if (error) {
        image.src = '';
        reject(error);
      } else resolve(data!);
    };
    image.crossOrigin = 'anonymous';
    image.referrerPolicy = 'no-referrer';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 192;
        const context = canvas.getContext('2d');
        if (!context || !image.naturalWidth || !image.naturalHeight) throw new Error('Invalid photo');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
        finish(undefined, canvas.toDataURL('image/jpeg', 0.85));
      } catch {
        finish(new Error('Photo cannot be embedded'));
      }
    };
    image.onerror = () => finish(new Error('Photo unavailable'));
    image.src = url;
  });
}

/** Only consumes loaded players and image URLs; no database requests. */
export async function createPlayerExcel(
  players: Player[],
  loadPhoto: (url: string) => Promise<string> = loadPlayerThumbnail,
  onProgress: (completed: number, total: number) => void = () => {}
): Promise<{ bytes: Uint8Array<ArrayBuffer>; missingPhotos: number }> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Players');
  sheet.columns = [
    { header: 'Player Photo', width: 18 },
    { header: 'First Name', width: 18 }, { header: 'Last Name', width: 18 },
    { header: 'Mobile', width: 18 }, { header: 'Jersey Number', width: 15 },
    { header: 'Player Type', width: 20 }, { header: 'T-Shirt Size', width: 14 },
    { header: 'Trouser Size', width: 14 }, { header: 'Base Bid', width: 14 },
    { header: 'Photo', width: 40 }, { header: 'Note', width: 35 },
    { header: 'Status', width: 16 }
  ];
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF143F71' } };
  sheet.getRow(1).height = 24;
  for (const player of players) {
    // Retain the Photo URL column for compatibility with Excel import.
    const row = sheet.addRow([
      player.photo ? 'Photo unavailable' : 'No photo', player.firstName, player.lastName,
      player.mobile, player.jerseyNumber, player.playerType, player.tshirtSize,
      player.trouserSize, player.baseBid, player.photo, player.note, player.status
    ]);
    row.height = 96;
    row.alignment = { vertical: 'middle', wrapText: true };
  }
  let next = 0;
  let missingPhotos = 0;
  let completed = 0;
  onProgress(0, players.length);
  // Limit simultaneous image downloads to avoid overwhelming the browser.
  await Promise.all(Array.from({ length: Math.min(4, players.length) }, async () => {
    while (next < players.length) {
      const index = next++;
      const player = players[index];
      if (!player.photo) {
        onProgress(++completed, players.length);
        continue;
      }
      try {
        const base64 = await loadPhoto(player.photo);
        const imageId = workbook.addImage({ base64, extension: 'jpeg' });
        sheet.addImage(imageId, {
          tl: { col: 0.1, row: index + 1 + 0.03 },
          ext: { width: 100, height: 120 }, editAs: 'oneCell'
        });
        sheet.getRow(index + 2).getCell(1).value = '';
      } catch {
        missingPhotos++;
      } finally {
        onProgress(++completed, players.length);
      }
    }
  }));
  return { bytes: new Uint8Array(await workbook.xlsx.writeBuffer()), missingPhotos };
}
