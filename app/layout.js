import './globals.css';

export const metadata = {
  title: 'YouTube Video Downloader',
  description: 'Download YouTube videos and shorts in any quality for free',
  icons: {
    icon: '/icon.svg',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
