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

  // return (
  //   <div>
  //     <h2>Login</h2>
  //     <input
  //       type="email"
  //       placeholder="Email"
  //       value={email}
  //       onChange={(e) => setEmail(e.target.value)}
  //     />
  //     <input
  //       type="password"
  //       placeholder="Password"
  //       value={password}
  //       onChange={(e) => setPassword(e.target.value)}
  //     />
  //     <button onClick={handleLogin}>Login</button>
  //   </div>
  // );

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white shadow-md rounded-lg p-8 max-w-sm w-full">
        <h1 className="text-2xl font-semibold text-gray-800 text-center mb-4">
          ISO New England Chatbot
        </h1>
        <p className="text-sm text-gray-600 text-center mb-6">
          Sign in to access real-time insights and interact with the ISO New England AI assistant.
        </p>
        <div>
          <label className="block text-gray-700 text-sm font-medium mb-2">
            Email
          </label>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 mb-4"
          />
          <label className="block text-gray-700 text-sm font-medium mb-2">
            Password
          </label>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 mb-6"
          />
          <button
            onClick={handleLogin}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition duration-300"
          >
            Login
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomLogin;