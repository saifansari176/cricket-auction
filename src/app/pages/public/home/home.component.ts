import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicHeaderComponent } from '../../../shared/public-header/public-header.component';

@Component({ selector: 'app-home', standalone: true, imports: [RouterLink, PublicHeaderComponent], templateUrl: './home.component.html', styleUrl: './home.component.scss' })
export class HomeComponent {}
