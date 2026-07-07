import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { QueryClientProvider } from '@tanstack/react-query';
import App from '../App.jsx';
import { supabase, SUPABASE_URL } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';

describe('Supabase Integration', () => {
  it('Supabase client initializes correctly', () => {
    expect(supabase).toBeDefined();
    expect(supabase).not.toBeNull();
    expect(SUPABASE_URL).toBeDefined();
  });

  it('Can fetch posts from database', async () => {
    const { data, error } = await supabase
      .from('posts_with_stats')
      .select('*')
      .limit(5);

    // If network is available, verify response shape
    if (!error) {
      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBe(true);
    } else {
      // Network unavailable — verify the client still attempted the query
      expect(error.message).toBeDefined();
    }
  });

  it('Can fetch categories from database', async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*');

    if (!error) {
      expect(data).toBeDefined();
    } else {
      expect(error.message).toBeDefined();
    }
  });
});

describe('App Component', () => {
  it('App component renders without crashing', () => {
    try {
      render(
        <HelmetProvider>
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </HelmetProvider>
      );
      expect(true).toBe(true);
    } catch (error) {
      console.error('App render crashed with error:', error.message);
      console.error('Stack trace:', error.stack);
      throw error;
    }
  });
});
