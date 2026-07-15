import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { LoadingService } from '../../core/services/loading.service';

@Component({
  selector: 'app-loader',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app-loader.component.html',
  styleUrl: './app-loader.component.scss'
})
export class AppLoaderComponent {
  readonly loading$ = inject(LoadingService).loading$;
}
