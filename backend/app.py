from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import yt_dlp
import re
import os
import tempfile
import shutil
import json
import threading
import uuid

app = Flask(__name__)
CORS(app, expose_headers=['Content-Length', 'Content-Disposition'])

# Store download progress and file paths
downloads = {}

# Cookie file path - check multiple locations
COOKIES_FILE = None
for path in ['/etc/secrets/cookies.txt', '/tmp/youtube_cookies.txt']:
    if os.path.exists(path):
        COOKIES_FILE = path
        break


def setup_cookies():
    """Copy cookies from secret file or env variable to a writable location."""
    global COOKIES_FILE

    writable_path = '/tmp/youtube_cookies.txt'

    # Check if secret file exists (Render secret files - read only)
    if os.path.exists('/etc/secrets/cookies.txt'):
        # Copy to writable location (yt-dlp needs to write to cookie file)
        shutil.copy2('/etc/secrets/cookies.txt', writable_path)
        COOKIES_FILE = writable_path
        print(f"[INFO] Cookies copied from secret file to {writable_path}")
        return

    # Fallback to environment variable
    cookies_content = os.environ.get('YOUTUBE_COOKIES', '')
    if cookies_content:
        cookies_content = cookies_content.replace('\\n', '\n')
        with open(writable_path, 'w') as f:
            f.write(cookies_content)
        COOKIES_FILE = writable_path
        print(f"[INFO] Cookies written from env to {writable_path}")
    else:
        print("[WARN] No cookies found")


def get_ydl_opts(skip_download=True):
    """Get common yt-dlp options with cookies."""
    opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': skip_download,
        'remote_components': ['ejs:github'],
    }
    if os.path.exists(COOKIES_FILE):
        opts['cookiefile'] = COOKIES_FILE
    return opts


def get_video_info(url):
    """Fetch video info and available formats using yt-dlp."""
    ydl_opts = get_ydl_opts(skip_download=True)

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        return info


@app.route('/api/qualities', methods=['GET'])
def get_qualities():
    """Return available quality options for a video."""
    url = request.args.get('url')

    if not url:
        return jsonify({'error': 'URL is required'}), 400

    try:
        info = get_video_info(url)
        formats = info.get('formats', [])

        # Extract unique resolutions with video
        quality_map = {}

        for f in formats:
            height = f.get('height')
            if height and f.get('vcodec') != 'none':
                label = f'{height}p'
                format_id = str(height)
                if format_id not in quality_map:
                    quality_map[format_id] = {
                        'format_id': format_id,
                        'label': label,
                        'height': height,
                    }

        # Sort by height descending
        qualities = sorted(quality_map.values(), key=lambda x: x['height'], reverse=True)

        # Ensure 144p and 240p are always present
        for h in [240, 144]:
            fid = str(h)
            if fid not in quality_map:
                qualities.append({'format_id': fid, 'label': f'{h}p', 'height': h})

        # Re-sort
        qualities = sorted(qualities, key=lambda x: x.get('height', 9999), reverse=True)

        # Add "best" option at the top
        qualities.insert(0, {'format_id': 'best', 'label': 'Best Quality'})

        # Add audio only option
        qualities.append({'format_id': 'audio', 'label': 'Audio Only'})

        # Remove height from response
        for q in qualities:
            q.pop('height', None)

        return jsonify({
            'title': info.get('title', ''),
            'qualities': qualities
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/download/start', methods=['GET'])
def start_download():
    """Start download and return download ID for progress tracking."""
    url = request.args.get('url')
    quality = request.args.get('quality', 'best')

    if not url:
        return jsonify({'error': 'URL is required'}), 400

    download_id = str(uuid.uuid4())

    # Set format based on quality selection
    if quality == 'best':
        format_str = 'bv*+ba/b'
    elif quality == 'audio':
        format_str = 'ba/b'
    else:
        format_str = f'bv*[height<={quality}]+ba/b[height<={quality}]/bv*+ba/b'

    ext = 'm4a' if quality == 'audio' else 'mp4'

    downloads[download_id] = {
        'progress': 0,
        'status': 'starting',
        'file_path': None,
        'filename': None,
        'error': None,
    }

    def do_download():
        temp_dir = tempfile.mkdtemp()
        output_path = os.path.join(temp_dir, f'video.{ext}')

        completed_streams = [0]

        def progress_hook(d):
            if d['status'] == 'downloading':
                total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
                downloaded = d.get('downloaded_bytes', 0)
                if total > 0:
                    stream_percent = (downloaded / total) * 45
                    base = completed_streams[0] * 45
                    percent = min(90, round(base + stream_percent))
                    downloads[download_id]['progress'] = percent
                downloads[download_id]['status'] = 'downloading'
            elif d['status'] == 'finished':
                completed_streams[0] += 1
                downloads[download_id]['progress'] = min(90, completed_streams[0] * 45)

        def postprocessor_hook(d):
            if d['status'] == 'started':
                downloads[download_id]['status'] = 'merging'
                downloads[download_id]['progress'] = 92
            elif d['status'] == 'finished':
                downloads[download_id]['progress'] = 98

        ydl_opts = get_ydl_opts(skip_download=False)
        ydl_opts.update({
            'format': format_str,
            'outtmpl': output_path,
            'merge_output_format': ext,
            'progress_hooks': [progress_hook],
            'postprocessor_hooks': [postprocessor_hook],
        })

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                title = info.get('title', 'video')
                safe_title = re.sub(r'[^\w\s-]', '', title)[:50].strip()

            filename = f'{safe_title}.{ext}'

            # Find the actual output file
            actual_file = output_path
            if not os.path.exists(actual_file):
                files = os.listdir(temp_dir)
                if files:
                    actual_file = os.path.join(temp_dir, files[0])
                else:
                    downloads[download_id]['status'] = 'error'
                    downloads[download_id]['error'] = 'Download failed - no output file'
                    return

            downloads[download_id]['progress'] = 100
            downloads[download_id]['status'] = 'done'
            downloads[download_id]['file_path'] = actual_file
            downloads[download_id]['temp_dir'] = temp_dir
            downloads[download_id]['filename'] = filename

        except Exception as e:
            downloads[download_id]['status'] = 'error'
            downloads[download_id]['error'] = str(e)

    # Start download in background thread
    thread = threading.Thread(target=do_download)
    thread.start()

    return jsonify({'download_id': download_id})


@app.route('/api/download/progress-poll/<download_id>', methods=['GET'])
def download_progress_poll(download_id):
    """Simple polling endpoint for download progress."""
    if download_id not in downloads:
        return jsonify({'error': 'Invalid download ID', 'status': 'error'}), 404

    info = downloads.get(download_id, {})
    data = {
        'progress': info.get('progress', 0),
        'status': info.get('status', 'unknown'),
    }

    if info.get('status') == 'error':
        data['error'] = info.get('error', 'Unknown error')

    return jsonify(data)


@app.route('/api/download/file/<download_id>', methods=['GET'])
def download_file(download_id):
    """Serve the downloaded file."""
    if download_id not in downloads:
        return jsonify({'error': 'Invalid download ID'}), 404

    info = downloads[download_id]

    if info['status'] != 'done' or not info.get('file_path'):
        return jsonify({'error': 'File not ready'}), 400

    file_path = info['file_path']
    filename = info['filename']
    temp_dir = info.get('temp_dir')

    def generate():
        try:
            with open(file_path, 'rb') as f:
                while True:
                    chunk = f.read(65536)
                    if not chunk:
                        break
                    yield chunk
        finally:
            if temp_dir:
                shutil.rmtree(temp_dir, ignore_errors=True)
            downloads.pop(download_id, None)

    file_size = os.path.getsize(file_path)
    content_type = 'audio/mp4' if filename.endswith('.m4a') else 'video/mp4'

    response = Response(generate(), content_type=content_type)
    response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
    response.headers['Content-Length'] = str(file_size)
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Expose-Headers'] = 'Content-Length, Content-Disposition'

    return response


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    cookie_status = 'not found'
    cookie_lines = 0
    if COOKIES_FILE and os.path.exists(COOKIES_FILE):
        with open(COOKIES_FILE, 'r') as f:
            lines = f.readlines()
            cookie_lines = len(lines)
            cookie_status = f'found ({cookie_lines} lines)'
    return jsonify({
        'status': 'ok',
        'message': 'YouTube Downloader API is running',
        'cookies': cookie_status,
        'cookies_path': COOKIES_FILE,
    })


# Setup cookies on startup
setup_cookies()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
