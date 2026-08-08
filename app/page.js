'use client';

import { useState } from 'react';

export default function Home() {
  const [url, setUrl] = useState('');
  const [videoInfo, setVideoInfo] = useState(null);
  const [qualities, setQualities] = useState([]);
  const [selectedQuality, setSelectedQuality] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
  const COBALT_API = 'https://cobaltapi.kittycat.boo';

  const extractVideoId = (inputUrl) => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
      /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
      /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
      /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    ];

    for (const pattern of patterns) {
      const match = inputUrl.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const fetchVideoInfo = async () => {
    setError('');
    setStatus('');
    setVideoInfo(null);
    setQualities([]);
    setSelectedQuality('');
    setDownloadProgress(0);

    if (!url.trim()) {
      setError('Please paste a YouTube URL');
      return;
    }

    const videoId = extractVideoId(url.trim());
    if (!videoId) {
      setError('Invalid YouTube URL. Please paste a valid video or shorts link.');
      return;
    }

    setLoading(true);

    try {
      // Fetch video info from our API route (oEmbed for preview)
      const infoRes = await fetch(`/api/video-info?url=${encodeURIComponent(url.trim())}`);
      const infoData = await infoRes.json();

      if (!infoRes.ok) {
        throw new Error(infoData.error || 'Failed to fetch video info');
      }

      setVideoInfo({
        id: videoId,
        title: infoData.title,
        author: infoData.author_name,
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      });

      // Fixed quality options (Cobalt supports these)
      setQualities([
        { format_id: '1080', label: '1080p' },
        { format_id: '720', label: '720p' },
        { format_id: '480', label: '480p' },
        { format_id: '360', label: '360p' },
        { format_id: '240', label: '240p' },
        { format_id: '144', label: '144p' },
      ]);
      setSelectedQuality('720');
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!videoInfo || !selectedQuality) return;

    setDownloading(true);
    setDownloadProgress(0);
    setError('');
    setStatus('');

    try {
      // Call Cobalt API directly
      setDownloadProgress(10);
      const cobaltRes = await fetch(`${COBALT_API}/`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: url.trim(),
          videoQuality: selectedQuality,
          youtubeVideoCodec: 'h264',
        }),
      });

      const cobaltData = await cobaltRes.json();
      setDownloadProgress(30);

      if (cobaltData.status === 'error') {
        throw new Error(cobaltData.error?.code || 'Download failed. Try a different video.');
      }

      if (cobaltData.status === 'tunnel' || cobaltData.status === 'redirect') {
        const downloadUrl = cobaltData.url;
        const filename = cobaltData.filename || `${videoInfo.title}.mp4`;

        // Fetch the file with progress
        const fileRes = await fetch(downloadUrl);

        if (!fileRes.ok) {
          throw new Error('Failed to download file');
        }

        const contentLength = fileRes.headers.get('Content-Length') || fileRes.headers.get('Estimated-Content-Length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;

        const reader = fileRes.body.getReader();
        const chunks = [];
        let received = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          chunks.push(value);
          received += value.length;

          if (total > 0) {
            const percent = 30 + Math.round((received / total) * 65);
            setDownloadProgress(Math.min(95, percent));
          } else {
            const mb = (received / (1024 * 1024)).toFixed(1);
            setStatus(`Downloading... ${mb} MB`);
            setDownloadProgress(Math.min(90, 30 + Math.round(received / (received + 500000) * 60)));
          }
        }

        setDownloadProgress(100);

        // Save file
        const blob = new Blob(chunks);
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);

        setStatus('Download complete!');
      } else if (cobaltData.status === 'picker') {
        // Multiple options - take the first video
        const firstItem = cobaltData.picker.find(p => p.type === 'video') || cobaltData.picker[0];
        window.open(firstItem.url, '_blank');
        setStatus('Download started!');
        setDownloadProgress(100);
      }
    } catch (err) {
      const msg = err.message || 'Download failed.';
      if (msg.includes('youtube.login')) {
        setError('This video requires YouTube login. Try a different video.');
      } else {
        setError(msg);
      }
    } finally {
      setDownloading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') fetchVideoInfo();
  };

  return (
    <div className="container">
      <header className="header">
        <h1>YouTube Video Downloader</h1>
        <p>Download videos & shorts in your preferred quality</p>
      </header>

      {/* URL Input */}
      <div className="input-section">
        <div className="input-wrapper">
          <input
            type="text"
            className="url-input"
            placeholder="Paste YouTube video or shorts URL here..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyPress}
            disabled={downloading}
          />
          <button
            className="fetch-btn"
            onClick={fetchVideoInfo}
            disabled={loading || downloading}
          >
            {loading ? 'Fetching...' : 'Fetch'}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && <div className="error-msg">{error}</div>}

      {/* Status Message */}
      {status && !downloading && <div className="status-msg">{status}</div>}

      {/* Loading */}
      {loading && (
        <div className="loading">
          <div className="spinner"></div>
          <span>Fetching video information...</span>
        </div>
      )}

      {/* Video Preview */}
      {videoInfo && !loading && (
        <div className="preview-section">
          <div className="video-embed">
            <iframe
              src={`https://www.youtube.com/embed/${videoInfo.id}`}
              title={videoInfo.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
          <div className="video-info">
            <h2 className="video-title">{videoInfo.title}</h2>
            <p className="video-author">{videoInfo.author}</p>
          </div>
        </div>
      )}

      {/* Quality Selection */}
      {videoInfo && qualities.length > 0 && !loading && (
        <div className="quality-section">
          <h3>Select Quality</h3>
          <div className={`quality-options ${downloading ? 'disabled' : ''}`}>
            {qualities.map((q) => (
              <button
                key={q.format_id}
                className={`quality-option ${selectedQuality === q.format_id ? 'selected' : ''}`}
                onClick={() => !downloading && setSelectedQuality(q.format_id)}
                disabled={downloading}
              >
                {q.label}
              </button>
            ))}
          </div>

          {/* Download Progress Bar */}
          {downloading && (
            <div className="progress-container">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${downloadProgress}%` }}
                ></div>
              </div>
              <div className="progress-text">
                {downloadProgress === 0
                  ? 'Starting download...'
                  : downloadProgress < 95
                  ? `Downloading... ${downloadProgress}%`
                  : downloadProgress < 100
                  ? 'Merging audio & video...'
                  : 'Complete!'}
              </div>
            </div>
          )}

          {!downloading && (
            <button
              className="download-btn"
              onClick={handleDownload}
              disabled={!selectedQuality}
            >
              Download Video
            </button>
          )}
        </div>
      )}

      {/* Coming Soon Section */}
      {videoInfo && !loading && (
        <div className="coming-soon-section">
          <h3>Coming Soon</h3>
          <div className="coming-soon-items">
            <div className="coming-soon-card">
              <span className="coming-soon-icon">🤖</span>
              <div>
                <h4>AI Video Summarizer</h4>
                <p>Get video summary in Hindi & English</p>
              </div>
              <span className="coming-soon-badge">Next Release</span>
            </div>
            <div className="coming-soon-card">
              <span className="coming-soon-icon">📋</span>
              <div>
                <h4>Playlist Download</h4>
                <p>Download entire playlists at once</p>
              </div>
              <span className="coming-soon-badge">Next Release</span>
            </div>
          </div>
        </div>
      )}

      <footer className="footer">
        <p>Built by 👑 <span className="footer-name">AB Victor</span></p>
        <p className="footer-sub">Respect content creators&apos; rights.</p>
      </footer>
    </div>
  );
}
