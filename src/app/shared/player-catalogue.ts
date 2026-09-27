import { Player } from '../core/models/player';

/** Builds a printable snapshot from loaded data; never queries Firestore. */
export async function openPlayerCatalogue(title: string, players: Player[]): Promise<boolean> {
  const popup = window.open('', '_blank');
  if (!popup) return false;
  popup.opener = null;
  const document = popup.document;
  document.title = `${title} - Player Catalogue`;
  document.documentElement.lang = 'en';
  const style = document.createElement('style');
  style.textContent = `
    * { box-sizing: border-box; }
    body { margin: 24px; color: #14243a; background: white; font: 14px Arial, sans-serif; }
    h1 { margin-bottom: 8px; } p { line-height: 1.5; }
    .toolbar { padding: 16px; margin-bottom: 24px; background: #edf3fa; border-radius: 8px; }
    button { padding: 12px 20px; background: #143f71; color: white; border: 0; border-radius: 6px; cursor: pointer; }
    button:disabled { opacity: .5; cursor: wait; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    article { display: flex; align-items: center; gap: 14px; padding: 12px; border: 1px solid #bbc7d5; border-radius: 8px; break-inside: avoid; }
    .photo { width: 100px; height: 120px; flex: 0 0 100px; display: grid; place-items: center; background: #f2f4f7; color: #586579; font-size: 12px; }
    img { width: 100%; height: 100%; object-fit: contain; }
    .details { min-width: 0; overflow-wrap: anywhere; }
    h2 { font-size: 17px; margin: 0 0 8px; } article p { margin: 4px 0; }
    @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
    @page { size: A4; margin: 12mm; }
    @media print { body { margin: 0; } .toolbar { display: none; } .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  `;
  document.head.append(style);
  // All player-supplied values are inserted as text, never interpreted as HTML.
  const element = (tag: string, text?: string) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const toolbar = element('div');
  toolbar.className = 'toolbar';
  const printButton = document.createElement('button');
  printButton.textContent = 'Print / Save as PDF';
  printButton.disabled = true;
  printButton.onclick = () => popup.print();
  const status = element('p', 'Preparing player photos…');
  status.setAttribute('role', 'status');
  toolbar.append(printButton, element('p', 'Choose Save as PDF in the print dialog to download this catalogue. You can share the saved file or view it offline.'), status);
  document.body.append(toolbar, element('h1', title), element('p', `${players.length} players • Created ${new Date().toLocaleString()} • Snapshot of the selected list; later changes are not included.`));
  const grid = element('section');
  grid.className = 'grid';
  document.body.append(grid);
  let missingPhotos = 0;
  const photos: Promise<void>[] = [];
  for (const player of players) {
    const card = element('article');
    const photo = element('div', 'No photo');
    photo.className = 'photo';
    let photoUrl: URL | undefined;
    try {
      const candidate = new URL(player.photo);
      if (candidate.protocol === 'https:' || candidate.protocol === 'http:') photoUrl = candidate;
    } catch { /* Missing or invalid photo: keep the placeholder. */ }
    if (photoUrl) {
      const url = photoUrl.href;
      photos.push(new Promise<void>((resolve) => {
        const img = document.createElement('img');
        img.alt = `${player.firstName} ${player.lastName}`;
        img.referrerPolicy = 'no-referrer';
        let finished = false;
        const finish = (loaded: boolean) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          img.onload = null;
          img.onerror = null;
          if (!loaded) {
            missingPhotos++;
            photo.textContent = 'Photo unavailable';
            img.removeAttribute('src');
          }
          resolve();
        };
        const timer = setTimeout(() => finish(false), 15000);
        img.onload = () => finish(true);
        img.onerror = () => finish(false);
        photo.replaceChildren(img);
        img.src = url;
      }));
    } else {
      missingPhotos++;
    }
    const details = element('div');
    details.className = 'details';
    details.append(
      element('h2', `${player.firstName} ${player.lastName}`),
      element('p', player.playerType || 'Player'),
      element('p', `Status: ${player.status || '—'}`),
      element('p', `Category: ${player.categoryName || 'Regular'}`),
      element('p', `Jersey: ${player.jerseyNumber || '—'}`)
    );
    card.append(photo, details);
    grid.append(card);
  }
  await Promise.all(photos);
  if (!popup.closed) {
    status.textContent = missingPhotos
      ? `Ready. ${missingPhotos} player photo(s) unavailable; placeholders will be printed.`
      : 'Ready. All player photos loaded.';
    printButton.disabled = false;
  }
  return true;
}
