import { Component, Input } from '@angular/core';
import { AbstractControl } from '@angular/forms';

export function fieldError(control: AbstractControl | null, label: string, patternMessage = ''): string {
  if (!control || !control.touched || !control.errors) return '';
  const errors = control.errors;
  if (errors['required'] || errors['whitespace']) return `${label} is required.`;
  if (errors['email']) return 'Enter a valid email address.';
  if (errors['minlength']) return `${label} must be at least ${errors['minlength'].requiredLength} characters.`;
  if (errors['maxlength']) return `${label} must be no more than ${errors['maxlength'].requiredLength} characters.`;
  if (errors['min']) return `${label} must be at least ${errors['min'].min}.`;
  if (errors['max']) return `${label} must be no more than ${errors['max'].max}.`;
  if (errors['integer']) return `${label} must be a whole number.`;
  if (errors['pattern']) return patternMessage || `Enter a valid ${label.toLowerCase()}.`;
  if (errors['mismatch']) return 'Passwords do not match.';
  if (errors['duplicate']) return `${label} already exists. Please use a different one.`;
  return `Check ${label.toLowerCase()} and try again.`;
}

@Component({
  selector: 'app-field-error',
  standalone: true,
  template: `<span class="field-error" [id]="fieldId + '-error'" aria-live="polite">{{message}}</span>`
})
export class FieldErrorComponent {
  @Input({ required: true }) control!: AbstractControl | null;
  @Input({ required: true }) label = '';
  @Input({ required: true }) fieldId = '';
  @Input() patternMessage = '';

  get message(): string {
    return fieldError(this.control, this.label, this.patternMessage);
  }
}
