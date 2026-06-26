/// <reference types="vite/client" />

// Raw imports — Vite's `?raw` suffix loads a file as a string.
declare module '*.md?raw' {
  const content: string;
  export default content;
}

// Electron <webview> tag — not in React's JSX types by default.
import type { DetailedHTMLProps, HTMLAttributes } from 'react';
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<HTMLAttributes<HTMLElement> & {
        src?: string;
        allowpopups?: boolean | string;
        partition?: string;
        useragent?: string;
        // Electron WebviewTag exposes more methods at runtime; we cast the ref.
      }, HTMLElement>;
    }
  }
}
