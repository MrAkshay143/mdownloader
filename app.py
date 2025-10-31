from flask import Flask, request, jsonify, Response, send_file
from flask_cors import CORS
import yt_dlp
import os
import tempfile
import json
import requests
from urllib.parse import urlparse, unquote
import re
import logging
from datetime import datetime
import threading
import time

app = Flask(__name__)
CORS(app)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global variables for download progress tracking
download_progress = {}

class ProgressHook:
    def __init__(self, download_id):
        self.download_id = download_id
    
    def __call__(self, d):
        if d['status'] == 'downloading':
            progress = {
                'status': 'downloading',
                'downloaded_bytes': d.get('downloaded_bytes', 0),
                'total_bytes': d.get('total_bytes', 0),
                'speed': d.get('speed', 0),
                'eta': d.get('eta', 0)
            }
            download_progress[self.download_id] = progress
        elif d['status'] == 'finished':
            download_progress[self.download_id] = {
                'status': 'finished',
                'filename': d.get('filename', '')
            }

def get_ydl_opts(output_path=None, format_selector=None, cookies=None):
    """Get yt-dlp options with common settings"""
    opts = {
        'quiet': True,
        'no_warnings': True,
        'extractaudio': False,
        'audioformat': 'mp3',
        'audioquality': '192',
        'embed_subs': False,
        'writesubtitles': False,
        'writeautomaticsub': False,
        'ignoreerrors': True,
        'no_check_certificate': True,
        'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    if output_path:
        opts['outtmpl'] = output_path
    
    if format_selector:
        opts['format'] = format_selector
    
    if cookies:
        opts['cookiefile'] = cookies
    
    return opts

@app.route('/api/info', methods=['POST'])
def get_video_info():
    """Get video information and available formats"""
    try:
        # Handle different request formats (JSON, form data, or query params)
        url = None
        cookies = None
        
        # Try to get URL and cookies from JSON data first
        if request.is_json:
            try:
                data = request.get_json()
                if data:
                    url = data.get('url', '').strip()
                    cookies = data.get('cookies')
            except Exception as e:
                logger.error(f"JSON parsing error: {str(e)}")
        
        # If no URL from JSON, try form data
        if not url:
            url = request.form.get('url', '').strip()
        
        # If still no URL, try query parameters
        if not url:
            url = request.args.get('url', '').strip()
        
        if not url:
            return jsonify({'error': 'URL is required'}), 400
        
        # Validate URL
        if not re.match(r'^https?://', url):
            return jsonify({'error': 'Invalid URL format'}), 400
        
        temp_cookie_file = None
        if cookies:
            try:
                # Create a temporary file to store the cookies
                with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt', encoding='utf-8') as temp_file:
                    temp_file.write(cookies)
                    temp_cookie_file = temp_file.name
                
                ydl_opts = get_ydl_opts(cookies=temp_cookie_file)
            except Exception as e:
                logger.error(f"Failed to create temporary cookie file: {e}")
                return jsonify({'error': 'Failed to process cookies'}), 500
        else:
            ydl_opts = get_ydl_opts()
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                info = ydl.extract_info(url, download=False)
                
                # Extract basic video information
                video_info = {
                    'id': info.get('id', ''),
                    'title': info.get('title', 'Unknown Title'),
                    'uploader': info.get('uploader', 'Unknown Uploader'),
                    'duration': info.get('duration', 0),
                    'view_count': info.get('view_count', 0),
                    'like_count': info.get('like_count', 0),
                    'description': info.get('description', '')[:500] + '...' if info.get('description', '') else '',
                    'upload_date': info.get('upload_date', ''),
                    'extractor': info.get('extractor', ''),
                    'webpage_url': info.get('webpage_url', url),
                    'thumbnail': info.get('thumbnail', ''),
                    'thumbnails': info.get('thumbnails', [])
                }
                
                # Extract video formats
                video_formats = []
                audio_formats = []
                
                formats = info.get('formats', [])
                
                # Process video formats
                seen_video_qualities = set()
                for fmt in formats:
                    if fmt.get('vcodec') != 'none' and fmt.get('acodec') != 'none':
                        height = fmt.get('height')
                        if height and height not in seen_video_qualities:
                            quality_label = f"{height}p"
                            if fmt.get('fps'):
                                quality_label += f"{fmt['fps']}"
                            
                            video_formats.append({
                                'format_id': fmt['format_id'],
                                'quality': quality_label,
                                'height': height,
                                'width': fmt.get('width'),
                                'ext': fmt.get('ext', 'mp4'),
                                'filesize': fmt.get('filesize'),
                                'fps': fmt.get('fps'),
                                'vcodec': fmt.get('vcodec'),
                                'acodec': fmt.get('acodec')
                            })
                            seen_video_qualities.add(height)
                
                # Process audio formats
                seen_audio_qualities = set()
                for fmt in formats:
                    if fmt.get('acodec') != 'none' and fmt.get('vcodec') == 'none':
                        abr = fmt.get('abr')
                        if abr and abr not in seen_audio_qualities:
                            audio_formats.append({
                                'format_id': fmt['format_id'],
                                'quality': f"{int(abr)}kbps",
                                'abr': abr,
                                'ext': fmt.get('ext', 'mp3'),
                                'filesize': fmt.get('filesize'),
                                'acodec': fmt.get('acodec')
                            })
                            seen_audio_qualities.add(abr)
                
                # Sort formats by quality
                video_formats.sort(key=lambda x: x.get('height', 0), reverse=True)
                audio_formats.sort(key=lambda x: x.get('abr', 0), reverse=True)
                
                # If no separate audio formats, create standard audio options
                if not audio_formats:
                    audio_formats = [
                        {'quality': '320kbps', 'format_id': 'bestaudio', 'ext': 'mp3'},
                        {'quality': '256kbps', 'format_id': 'bestaudio', 'ext': 'mp3'},
                        {'quality': '192kbps', 'format_id': 'bestaudio', 'ext': 'mp3'},
                        {'quality': '128kbps', 'format_id': 'bestaudio', 'ext': 'mp3'}
                    ]
                
                return jsonify({
                    'success': True,
                    'info': video_info,
                    'formats': {
                        'video': video_formats[:10],  # Limit to top 10 video formats
                        'audio': audio_formats[:6]    # Limit to top 6 audio formats
                    }
                })
                
            except yt_dlp.DownloadError as e:
                logger.error(f"yt-dlp error: {str(e)}")
                return jsonify({'error': f'Failed to extract video info: {str(e)}'}), 400
            except Exception as e:
                logger.error(f"Extraction error: {str(e)}")
                return jsonify({'error': f'Failed to process video: {str(e)}'}), 500
            finally:
                # Clean up the temporary cookie file
                if temp_cookie_file and os.path.exists(temp_cookie_file):
                    os.remove(temp_cookie_file)
                
    except Exception as e:
        logger.error(f"General error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/download/video', methods=['POST'])
def download_video():
    """Download video file"""
    try:
        url = request.form.get('url', '').strip()
        format_id = request.form.get('format_id', 'best')
        quality = request.form.get('quality', 'best')
        
        if not url:
            return jsonify({'error': 'URL is required'}), 400
        
        # Create temporary directory for download
        temp_dir = tempfile.mkdtemp()
        
        # Set up yt-dlp options for video download
        ydl_opts = get_ydl_opts(
            output_path=os.path.join(temp_dir, '%(title)s.%(ext)s'),
            format_selector=format_id if format_id != 'best' else 'best[height<=?1080]'
        )
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                # Extract info first to get filename
                info = ydl.extract_info(url, download=False)
                title = info.get('title', 'video')
                
                # Clean filename
                safe_title = re.sub(r'[<>:"/\\|?*]', '_', title)[:100]
                
                # Download the video
                ydl.download([url])
                
                # Find the downloaded file
                downloaded_files = []
                for file in os.listdir(temp_dir):
                    if os.path.isfile(os.path.join(temp_dir, file)):
                        downloaded_files.append(file)
                
                if not downloaded_files:
                    return jsonify({'error': 'Download failed - no file created'}), 500
                
                file_path = os.path.join(temp_dir, downloaded_files[0])
                
                # Return file for download
                def remove_file(response):
                    try:
                        os.remove(file_path)
                        os.rmdir(temp_dir)
                    except:
                        pass
                    return response
                
                return send_file(
                    file_path,
                    as_attachment=True,
                    download_name=f"{safe_title}.{downloaded_files[0].split('.')[-1]}",
                    mimetype='video/mp4'
                )
                
            except yt_dlp.DownloadError as e:
                return jsonify({'error': f'Download failed: {str(e)}'}), 400
            except Exception as e:
                return jsonify({'error': f'Processing failed: {str(e)}'}), 500
                
    except Exception as e:
        logger.error(f"Video download error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/download/audio', methods=['POST'])
def download_audio():
    """Download audio file"""
    try:
        url = request.form.get('url', '').strip()
        bitrate = request.form.get('bitrate', '192')
        
        if not url:
            return jsonify({'error': 'URL is required'}), 400
        
        # Create temporary directory for download
        temp_dir = tempfile.mkdtemp()
        
        # Set up yt-dlp options for audio download
        ydl_opts = get_ydl_opts(
            output_path=os.path.join(temp_dir, '%(title)s.%(ext)s')
        )
        
        # Configure for audio extraction
        ydl_opts.update({
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': bitrate,
            }],
        })
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                # Extract info first to get filename
                info = ydl.extract_info(url, download=False)
                title = info.get('title', 'audio')
                
                # Clean filename
                safe_title = re.sub(r'[<>:"/\\|?*]', '_', title)[:100]
                
                # Download and convert to audio
                ydl.download([url])
                
                # Find the downloaded file
                downloaded_files = []
                for file in os.listdir(temp_dir):
                    if os.path.isfile(os.path.join(temp_dir, file)) and file.endswith('.mp3'):
                        downloaded_files.append(file)
                
                if not downloaded_files:
                    return jsonify({'error': 'Audio extraction failed'}), 500
                
                file_path = os.path.join(temp_dir, downloaded_files[0])
                
                # Return file for download
                return send_file(
                    file_path,
                    as_attachment=True,
                    download_name=f"{safe_title}.mp3",
                    mimetype='audio/mpeg'
                )
                
            except yt_dlp.DownloadError as e:
                return jsonify({'error': f'Download failed: {str(e)}'}), 400
            except Exception as e:
                return jsonify({'error': f'Processing failed: {str(e)}'}), 500
                
    except Exception as e:
        logger.error(f"Audio download error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/thumbnail/proxy')
def proxy_thumbnail():
    """Proxy thumbnail images to avoid CORS issues"""
    try:
        thumbnail_url = request.args.get('url')
        if not thumbnail_url:
            return jsonify({'error': 'URL parameter required'}), 400
        
        # Fetch the thumbnail
        response = requests.get(thumbnail_url, timeout=10, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        
        if response.status_code == 200:
            return Response(
                response.content,
                mimetype=response.headers.get('content-type', 'image/jpeg'),
                headers={'Cache-Control': 'public, max-age=3600'}
            )
        else:
            return jsonify({'error': 'Failed to fetch thumbnail'}), 404
            
    except Exception as e:
        logger.error(f"Thumbnail proxy error: {str(e)}")
        return jsonify({'error': 'Failed to proxy thumbnail'}), 500

@app.route('/api/thumbnail/placeholder')
def placeholder_thumbnail():
    """Generate placeholder thumbnail"""
    platform = request.args.get('platform', 'unknown')
    
    # Simple SVG placeholder
    svg_content = f'''
    <svg width="320" height="180" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#f0f0f0"/>
        <text x="50%" y="50%" text-anchor="middle" dy=".3em" font-family="Arial, sans-serif" font-size="16" fill="#666">
            {platform.upper()} Video
        </text>
    </svg>
    '''
    
    return Response(svg_content, mimetype='image/svg+xml')

@app.route('/health')
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'timestamp': datetime.now().isoformat()})

@app.route('/')
def index():
    """Serve the main page"""
    return send_file('index.html')

@app.route('/static/<path:filename>')
def static_files(filename):
    """Serve static files"""
    return send_file(filename)

@app.route('/<path:filename>')
def serve_frontend_files(filename):
    """Serve frontend files"""
    try:
        return send_file(filename)
    except:
        return send_file('index.html')

# Export the app for Vercel
application = app

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)