"use client";

import { createContext, useEffect, useState } from "react";
import { supabaseBrowserClient } from "@/utils/supabaseBrowser";
import ChatInterface from "./ChatInterface";
// import CustomLogin from './CustomLogin';
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";



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
        // <CustomLogin onLogin={setUserId} />
        <div
          className="flex flex-col items-center justify-center min-h-screen"
          style={{ backgroundColor: "#3E525B" }} // ISO New England Dark Bluish Gray
        >
          <div className="text-center mb-6">
            <h1
              className="mb-4 text-4xl font-extrabold leading-none tracking-tight md:text-5xl lg:text-6xl"
              style={{ color: "#FAB82E" }} // ISO New England Yellow
            >
              Project Thor
            </h1>
            <p className="mb-6 text-lg font-normal text-gray-100 lg:text-xl sm:px-16 xl:px-48">
              Built by Team Odin. Sign in to interact with the ISO New
              England AI assistant.
            </p>
          </div>
          <div className="w-full max-w-3xl px-4">
            <Auth
              supabaseClient={supabaseBrowserClient}
              appearance={{ theme: ThemeSupa }}
              theme="dark" // Options: 'default', 'dark', 'evenDarker'
              providers={[]}
            />
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
};

export default AuthWrapper;
