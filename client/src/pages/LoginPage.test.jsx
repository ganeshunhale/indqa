import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LoginPage from './LoginPage';
import { AuthProvider } from '../contexts/AuthContext';

function renderLogin() {
  return render(
    <AuthProvider>
      <LoginPage />
    </AuthProvider>
  );
}

describe('LoginPage', () => {
  it('renders the sign-in form by default', () => {
    renderLogin();
    expect(screen.getByText('Welcome Back')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    // The Name field only appears in register mode.
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('switches to register mode and shows the Name + Preferred Language fields', () => {
    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText(/Preferred Language/)).toBeInTheDocument();
  });

  it('enforces a minimum password length in register mode', () => {
    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('minLength', '8');
  });
});
