'use client'

import { supabaseBrowserClient } from '@/utils/supabaseBrowser';
import React, { useState } from 'react';

const CustomLogin: React.FC<{ onLogin: (userId: string) => void }> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    try {
      const { data, error } = await supabaseBrowserClient.auth.signInWithPassword({
        email,
        password,
      });
      const user = data.user;
      if (error) throw error;
      if (user) {
        onLogin(user.id);
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error logging in:', error.message);
      } else {
        console.error('Error logging in:', error);
      }
    }
  };

  return (
    <div>
      <h2>Login</h2>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button onClick={handleLogin}>Login</button>
    </div>
  );
};

export default CustomLogin;