import { FormControl, Validators } from '@angular/forms';
import { fieldError } from './field-error.component';
import { matchesControl, nonBlank, wholeNumber } from './validators';

describe('Field validation messages', () => {
  it('waits for interaction, reports the actual error, and clears after correction', () => {
    const control = new FormControl('', [Validators.required, nonBlank, Validators.minLength(2)]);
    expect(fieldError(control, 'First Name')).toBe('');
    control.markAsTouched();
    expect(fieldError(control, 'First Name')).toBe('First Name is required.');
    control.setValue('   ');
    expect(fieldError(control, 'First Name')).toBe('First Name is required.');
    control.setValue('A');
    expect(fieldError(control, 'First Name')).toBe('First Name must be at least 2 characters.');
    control.setValue('Asha');
    expect(fieldError(control, 'First Name')).toBe('');
  });

  it('distinguishes required, minimum, and fractional counts', () => {
    const control = new FormControl<number | null>(null, [Validators.required, Validators.min(1), wholeNumber]);
    control.markAsTouched();
    expect(fieldError(control, 'Team Limit')).toBe('Team Limit is required.');
    control.setValue(0);
    expect(fieldError(control, 'Team Limit')).toBe('Team Limit must be at least 1.');
    control.setValue(1.5);
    expect(fieldError(control, 'Team Limit')).toBe('Team Limit must be a whole number.');
    control.setValue(2);
    expect(fieldError(control, 'Team Limit')).toBe('');
  });

  it('uses field-specific format guidance', () => {
    const control = new FormControl('123', [Validators.pattern(/^[0-9]{10}$/)]);
    control.markAsTouched();
    expect(fieldError(control, 'Mobile Number', 'Enter a valid 10-digit mobile number.'))
      .toBe('Enter a valid 10-digit mobile number.');
  });

  it('checks password confirmation against the current password', () => {
    const password = new FormControl('secret1');
    const confirmation = new FormControl('secret2', matchesControl(password));
    expect(confirmation.hasError('mismatch')).toBeTrue();
    password.setValue('secret2');
    confirmation.updateValueAndValidity();
    expect(confirmation.valid).toBeTrue();
  });
});
