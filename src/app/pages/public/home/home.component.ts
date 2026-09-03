import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { PublicHeaderComponent } from '../../../shared/public-header/public-header.component';
import { AuthService } from '../../../core/services/auth.service';

@Component({ selector: 'app-home', standalone: true, imports: [PublicHeaderComponent], templateUrl: './home.component.html', styleUrl: './home.component.scss' })
export class HomeComponent {
  constructor(private authService: AuthService, private router: Router) {}

  async getStarted(): Promise<void> {
    const user = await this.authService.waitForUser();
    await this.router.navigate([user?.active ? '/dashboard' : '/login']);
  }
}
