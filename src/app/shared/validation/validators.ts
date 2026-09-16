import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Required text must contain something other than spaces. */
export const nonBlank: ValidatorFn = (control: AbstractControl): ValidationErrors | null =>
  typeof control.value === 'string' && control.value.length > 0 && !control.value.trim()
    ? { whitespace: true }
    : null;

/** Counts can be empty for the required validator, but cannot be fractional. */
export const wholeNumber: ValidatorFn = (control: AbstractControl): ValidationErrors | null =>
  control.value === null || control.value === '' || Number.isInteger(Number(control.value))
    ? null
    : { integer: true };

export const matchesControl = (other: AbstractControl): ValidatorFn => control =>
  control.value && control.value !== other.value ? { mismatch: true } : null;
