import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { VotePage } from './components/VotePage';

const voteMatch = window.location.pathname.match(/^\/v\/([^/]+)/);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {voteMatch ? (
      <VotePage shareId={voteMatch[1]} />
    ) : (
      <App />
    )}
  </StrictMode>,
);
