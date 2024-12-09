'use client';

import { createContext, useEffect, useState } from 'react';
import { supabaseBrowserClient } from '@/utils/supabaseBrowser';
// import { Auth } from '@supabase/auth-ui-react';
// import { ThemeSupa } from '@supabase/auth-ui-shared';
import ChatInterface from './ChatInterface';
import CustomLogin from './CustomLogin';

/**
 * @typedef {Object} AuthContextType
 * @property {string|undefined} userId - The authenticated user's ID or undefined if not authenticated.
 * @property {React.Dispatch<React.SetStateAction<string|undefined>>} setUserId - Function to update the userId state.
 */
export interface AuthContextType {
  userId: string | undefined;
  setUserId: React.Dispatch<React.SetStateAction<string | undefined>>;
}

/**
 * Context to manage authentication state.
 * @type {React.Context<AuthContextType>}
 */
export const AuthContext = createContext<AuthContextType>({
  userId: undefined,
  setUserId: () => {},
});

/**
 * AuthWrapper component handles user authentication state and renders
 * the appropriate UI based on the authentication status.
 * 
 * @returns {JSX.Element} The AuthWrapper component.
 */
const AuthWrapper: React.FC = () => {
  const [userId, setUserId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const { data: authListener } = supabaseBrowserClient.auth.onAuthStateChange(
      (event, session) => {
        if (session?.user) {
          setUserId(session.user.id);
        } else {
          setUserId(undefined);
        }
      }
    );

    // Cleanup subscription on unmount
    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ userId, setUserId }}>
      {userId ? (
        <ChatInterface />
      ) : (
        <CustomLogin onLogin={setUserId} />
      )}
    </AuthContext.Provider>
  );
};

export default AuthWrapper;
