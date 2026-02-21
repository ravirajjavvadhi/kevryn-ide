import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';


import { GoogleOAuthProvider } from '@react-oauth/google';

const root = ReactDOM.createRoot(document.getElementById('root'));
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || "330132460388-isud3o4s3nanm34p5m20eg576bmndhkv.apps.googleusercontent.com";
console.log("Google Client ID Status:", GOOGLE_CLIENT_ID ? "Loaded" : "Missing");

root.render(
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <App />
    </GoogleOAuthProvider>
);