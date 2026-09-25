import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, ViewChild } from '@angular/core';

type Rect = { x: number; y: number; width: number; height: number };
type DragMode = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

@Component({ selector: 'app-image-cropper', standalone: true, imports: [CommonModule], templateUrl: './image-cropper.component.html', styleUrl: './image-cropper.component.scss' })
export class ImageCropperComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() file: File | null = null; @Output() cropped = new EventEmitter<File>(); @Output() cancelled = new EventEmitter<void>(); @ViewChild('workspace') workspace?: ElementRef<HTMLElement>;
  @Input() label = 'player photo';
  @Input() outputFileName = 'player-photo.jpg';
  url = ''; imageReady = false; image?: HTMLImageElement; imageRect: Rect = { x: 0, y: 0, width: 0, height: 0 }; selection: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private drag?: { mode: DragMode; startX: number; startY: number; selection: Rect }; private viewReady = false; private readonly minimumSize = 70;
  ngAfterViewInit(): void { this.viewReady = true; this.layoutImage(); }
  ngOnChanges(): void { if (!this.file) return; if (this.url) URL.revokeObjectURL(this.url); this.url = URL.createObjectURL(this.file); this.imageReady = false; this.image = undefined; }
  ngOnDestroy(): void { if (this.url) URL.revokeObjectURL(this.url); }
  onImageLoad(event: Event): void { this.image = event.target as HTMLImageElement; this.imageReady = true; this.layoutImage(); }
  startDrag(event: PointerEvent, mode: DragMode = 'move'): void { if (!this.imageReady) return; event.preventDefault(); event.stopPropagation(); this.drag = { mode, startX: event.clientX, startY: event.clientY, selection: { ...this.selection } }; (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); }
  dragSelection(event: PointerEvent): void { if (!this.drag) return; const dx = event.clientX - this.drag.startX, dy = event.clientY - this.drag.startY, original = this.drag.selection, right = original.x + original.width, bottom = original.y + original.height, imageRight = this.imageRect.x + this.imageRect.width, imageBottom = this.imageRect.y + this.imageRect.height; const next = { ...original };
    if (this.drag.mode === 'move') { next.x = this.clamp(original.x + dx, this.imageRect.x, imageRight - original.width); next.y = this.clamp(original.y + dy, this.imageRect.y, imageBottom - original.height); }
    else { if (this.drag.mode.includes('w')) { next.x = this.clamp(original.x + dx, this.imageRect.x, right - this.minimumSize); next.width = right - next.x; } if (this.drag.mode.includes('e')) next.width = this.clamp(original.width + dx, this.minimumSize, imageRight - original.x); if (this.drag.mode.includes('n')) { next.y = this.clamp(original.y + dy, this.imageRect.y, bottom - this.minimumSize); next.height = bottom - next.y; } if (this.drag.mode.includes('s')) next.height = this.clamp(original.height + dy, this.minimumSize, imageBottom - original.y); }
    this.selection = next; }
  endDrag(): void { this.drag = undefined; }
  async save(): Promise<void> { if (!this.file || !this.image || !this.selection.width || !this.imageRect.width) return; const scaleX = this.image.naturalWidth / this.imageRect.width, scaleY = this.image.naturalHeight / this.imageRect.height, sourceX = (this.selection.x - this.imageRect.x) * scaleX, sourceY = (this.selection.y - this.imageRect.y) * scaleY, sourceWidth = this.selection.width * scaleX, sourceHeight = this.selection.height * scaleY, outputScale = Math.min(1, 1200 / Math.max(sourceWidth, sourceHeight)); const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(sourceWidth * outputScale)); canvas.height = Math.max(1, Math.round(sourceHeight * outputScale)); const context = canvas.getContext('2d'); if (!context) return; context.drawImage(this.image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height); const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .9)); if (blob) this.cropped.emit(new File([blob], this.outputFileName, { type: 'image/jpeg' })); }
  private layoutImage(): void { if (!this.viewReady || !this.image || !this.workspace) return; requestAnimationFrame(() => { const area = this.workspace!.nativeElement.getBoundingClientRect(); if (!area.width || !area.height || !this.image) return; const ratio = Math.min(area.width / this.image.naturalWidth, area.height / this.image.naturalHeight), width = this.image.naturalWidth * ratio, height = this.image.naturalHeight * ratio, insetX = width * .12, insetY = height * .12; this.imageRect = { x: (area.width - width) / 2, y: (area.height - height) / 2, width, height }; this.selection = { x: this.imageRect.x + insetX, y: this.imageRect.y + insetY, width: Math.max(this.minimumSize, width - insetX * 2), height: Math.max(this.minimumSize, height - insetY * 2) }; }); }
  private clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
}
