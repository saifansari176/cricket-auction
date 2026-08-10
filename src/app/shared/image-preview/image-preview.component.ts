import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { ImagePreviewData, ImagePreviewService } from './image-preview.service';

@Component({
  selector: 'app-image-preview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './image-preview.component.html',
  styleUrl: './image-preview.component.scss'
})
export class ImagePreviewComponent implements OnInit, OnDestroy {
  preview: ImagePreviewData | null = null;
  private subscription?: Subscription;

  constructor(private service: ImagePreviewService) {}

  ngOnInit(): void {
    this.subscription = this.service.state.subscribe((data) => {
      this.preview = data;
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  close(): void {
    this.service.close();
  }
}

