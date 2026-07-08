import React, { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useToast } from '../lib/appShared.js';

// PASSWORD RESET MODAL
// Shown after a user follows the reset link from their email (?recovery=1).
// At that point Supabase has already established a recovery session, so we
// just collect a new password and call updateUser().
// ============================================
const PasswordResetModal = ({ isOpen, onClose }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const { addToast } = useToast();

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      addToast('Password updated! You are now signed in.', 'success');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
        <div className="auth-logo-container">
          <img src="/logo-icon.svg" alt="Prompted" className="auth-logo" />
        </div>
        <div className="modal-header">
          <h2 className="modal-title">{done ? 'Password Updated' : 'Choose a New Password'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {done ? (
            <div style={{ textAlign: 'center', padding: '0.5rem 0 1rem' }}>
              <p style={{ color: '#ddd', fontSize: '0.95rem', lineHeight: 1.6 }}>
                Your password has been changed and you're signed in. You can close this window.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '1.25rem', justifyContent: 'center' }}
                onClick={onClose}
              >
                Continue
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <p style={{ textAlign: 'center', color: '#aaa', fontSize: '0.9rem', margin: '0 0 1rem', lineHeight: 1.5 }}>
                Enter a new password for your account.
              </p>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input
                  type="password"
                  className={`form-input ${error ? 'error' : ''}`}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm New Password</label>
                <input
                  type="password"
                  className={`form-input ${error ? 'error' : ''}`}
                  placeholder="••••••••"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              {error && <p className="form-error">{error}</p>}
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '1rem', justifyContent: 'center' }}
                disabled={loading}
              >
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default PasswordResetModal;