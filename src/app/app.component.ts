import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { HeaderComponent } from './layout/header/header.component';
import { MessageModalComponent } from './shared/message-modal/message-modal.component';
import { AppLoaderComponent } from './shared/app-loader/app-loader.component';
import { ImagePreviewComponent } from './shared/image-preview/image-preview.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule,
 RouterOutlet,
 HeaderComponent,
 MessageModalComponent,
 AppLoaderComponent,
 ImagePreviewComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'cricket-auction';

  constructor(private router: Router) {}

  get showShell(): boolean {
    const publicPaths = ['/', '/login', '/player-registration', '/watch', '/how-it-works', '/past-auctions'];
    return !publicPaths.some((path) => path === '/' ? this.router.url === '/' : this.router.url.startsWith(path));
  }
}
