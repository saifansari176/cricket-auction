import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicHeaderComponent } from '../../../shared/public-header/public-header.component';

@Component({
  selector: 'app-watch-landing',
  standalone: true,
  imports: [PublicHeaderComponent, RouterLink],
  templateUrl: './watch-landing.component.html',
  styleUrl: './watch-landing.component.scss'
})
export class WatchLandingComponent {}
