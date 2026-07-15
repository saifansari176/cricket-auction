import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { HeaderComponent } from './layout/header/header.component';
import { MessageModalComponent } from './shared/message-modal/message-modal.component';
import { AppLoaderComponent } from './shared/app-loader/app-loader.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule,
 RouterOutlet,
 HeaderComponent,
 MessageModalComponent,
 AppLoaderComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'cricket-auction';

  constructor(private router: Router) {}

  get showShell(): boolean {
    return !this.router.url.startsWith('/login') && !this.router.url.startsWith('/player-registration');
  }
}
