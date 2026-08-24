import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, inject } from '@angular/core';
import { ConfirmationResult } from 'firebase/auth';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { PublicHeaderComponent } from '../../../shared/public-header/public-header.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, PublicHeaderComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  @ViewChild('recaptchaContainer') recaptchaContainer?: ElementRef<HTMLElement>;
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  loading = false;
  errorMessage = '';
  successMessage = '';
  isRegistering = false;
  phoneMode = false;
  otpSent = false;
  private phoneConfirmation: ConfirmationResult | null = null;

  form = this.fb.group({
    displayName: [''],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: [''],
    phone: [''],
    otp: ['']
  });

  ngOnInit(): void {
    this.setRegisterMode(this.route.snapshot.queryParamMap.get('register') === 'true');
  }

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

  get phone() { return this.form.controls.phone; }
  get otp() { return this.form.controls.otp; }

  setRegisterMode(isRegistering: boolean): void {
    this.isRegistering = isRegistering;
    this.errorMessage = '';
    this.successMessage = '';

    this.displayName.setValidators(isRegistering ? [Validators.required, Validators.minLength(2)] : []);
    this.confirmPassword.setValidators(isRegistering ? [Validators.required] : []);
    this.displayName.updateValueAndValidity();
    this.confirmPassword.updateValueAndValidity();
  }

  setPhoneMode(phoneMode: boolean): void {
    this.phoneMode = phoneMode;
    this.otpSent = false;
    this.phoneConfirmation = null;
    this.errorMessage = '';
    this.successMessage = '';
    this.phone.setValidators(phoneMode ? [Validators.required, Validators.pattern(/^[6-9]\d{9}$/)] : []);
    this.otp.setValidators([]);
    this.phone.updateValueAndValidity();
    this.otp.updateValueAndValidity();
  }

  async loginWithGoogle(): Promise<void> {
    await this.completeProviderLogin(() => this.authService.loginWithGoogle());
  }

  async sendOtp(): Promise<void> {
    if (this.phone.invalid || !this.recaptchaContainer) {
      this.phone.markAsTouched();
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    try {
      this.phoneConfirmation = await this.authService.sendPhoneOtp(`+91${this.phone.value || ''}`, this.recaptchaContainer.nativeElement);
      this.otpSent = true;
      this.otp.setValidators([Validators.required, Validators.pattern(/^\d{6}$/)]);
      this.otp.updateValueAndValidity();
      this.successMessage = 'OTP sent to your phone number.';
    } catch (error: unknown) {
      this.errorMessage = this.getLoginErrorMessage(this.getErrorCode(error), this.getErrorMessage(error));
    } finally {
      this.loading = false;
    }
  }

  keepPhoneDigits(): void {
    const digits = (this.phone.value || '').replace(/\D/g, '').slice(0, 10);
    if (digits !== this.phone.value) {
      this.phone.setValue(digits, { emitEvent: false });
    }
  }

  async verifyOtp(): Promise<void> {
    if (!this.phoneConfirmation || this.otp.invalid) {
      this.otp.markAsTouched();
      return;
    }

    await this.completeProviderLogin(() => this.authService.loginWithPhoneOtp(this.phoneConfirmation!, this.otp.value || ''));
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
      case 'auth/operation-not-allowed':
        return 'Phone OTP login is not enabled yet. Please enable Phone as a sign-in provider in Firebase Authentication.';
      case 'auth/popup-closed-by-user':
        return 'Sign-in was cancelled.';
      case 'auth/account-exists-with-different-credential':
        return 'This email is already registered with a different sign-in method.';
      case 'auth/invalid-phone-number':
        return 'Enter a valid 10-digit Indian mobile number.';
      case 'auth/invalid-verification-code':
        return 'The OTP is invalid or has expired.';
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

  private async completeProviderLogin(login: () => Promise<unknown>): Promise<void> {
    this.loading = true;
    this.errorMessage = '';
    try {
      await login();
      await this.router.navigateByUrl('/auction-settings');
    } catch (error: unknown) {
      this.errorMessage = this.getLoginErrorMessage(this.getErrorCode(error), this.getErrorMessage(error));
    } finally {
      this.loading = false;
    }
  }
}
