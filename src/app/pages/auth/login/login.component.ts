import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  loading = false;
  errorMessage = '';
  successMessage = '';
  isRegistering = false;

  form = this.fb.group({
    displayName: [''],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['']
  });

  get displayName() {
    return this.form.controls.displayName;
  }

  get email() {
    return this.form.controls.email;
  }

  get password() {
    return this.form.controls.password;
  }

  get confirmPassword() {
    return this.form.controls.confirmPassword;
  }

  setRegisterMode(isRegistering: boolean): void {
    this.isRegistering = isRegistering;
    this.errorMessage = '';
    this.successMessage = '';

    this.displayName.setValidators(isRegistering ? [Validators.required, Validators.minLength(2)] : []);
    this.confirmPassword.setValidators(isRegistering ? [Validators.required] : []);
    this.displayName.updateValueAndValidity();
    this.confirmPassword.updateValueAndValidity();
  }

  async login(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    try {
      if (this.isRegistering) {
        if (this.password.value !== this.confirmPassword.value) {
          this.confirmPassword.setErrors({ mismatch: true });
          this.confirmPassword.markAsTouched();
          this.loading = false;
          return;
        }

        await this.authService.register(
          this.form.value.email || '',
          this.form.value.password || '',
          this.form.value.displayName || ''
        );

        await this.authService.logout();
        this.setRegisterMode(false);
        this.form.reset();
        this.successMessage = 'Registration successful. Please login with your new account.';
      } else {
        await this.authService.login(
          this.form.value.email || '',
          this.form.value.password || ''
        );

        await this.router.navigateByUrl('/auction-settings');
      }
    } catch (error: unknown) {
      this.errorMessage = this.getLoginErrorMessage(this.getErrorCode(error), this.getErrorMessage(error));
    }

    this.loading = false;
  }

  private getLoginErrorMessage(code?: string, fallback = 'Unable to login.'): string {
    switch (code) {
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/invalid-credential':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return 'Invalid email or password.';
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Please try again later.';
      case 'auth/network-request-failed':
        return 'Network error. Please check your connection.';
      case 'auth/email-already-in-use':
        return 'An account already exists for this email address.';
      case 'auth/weak-password':
        return 'Password must be at least 6 characters.';
      default:
        return fallback || 'Unable to login.';
    }
  }

  private getErrorCode(error: unknown): string | undefined {
    return typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : undefined;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unable to login.';
  }
}
