class YouTubeDownloader {
    constructor() {
        this.currentVideoInfo = null;
        this.currentUrl = '';
        this.settings = this.loadSettings();
        this.recentDownloads = this.loadRecentDownloads();
        
        this.initializeEventListeners();
        this.loadSettingsUI();
        this.updateRecentDownloadsUI();
    }

    initializeEventListeners() {
        // Navigation - only handle home page navigation since Recent and Settings are separate pages
        document.querySelectorAll('.nav-btn[data-page="home"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchPage('home');
            });
        });

        // Home page
        document.getElementById('get-formats-btn').addEventListener('click', () => {
            this.getVideoFormats();
        });

        document.getElementById('youtube-url').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.getVideoFormats();
            }
        });

        // Format tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Audio format buttons
        document.querySelectorAll('#audio-formats .format-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const bitrate = e.currentTarget.dataset.bitrate;
                this.downloadAudio(bitrate);
            });
        });

        // Recent downloads
        const clearAllBtn = document.getElementById('clear-all-btn');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', () => {
                this.clearAllRecentDownloads();
            });
        }

        // Settings
        const videoQualitySelect = document.getElementById('default-video-quality');
        if (videoQualitySelect) {
            videoQualitySelect.addEventListener('change', (e) => {
                this.settings.defaultVideoQuality = e.target.value;
                this.saveSettings();
            });
        }

        const audioBitrateSelect = document.getElementById('default-audio-bitrate');
        if (audioBitrateSelect) {
            audioBitrateSelect.addEventListener('change', (e) => {
                this.settings.defaultAudioBitrate = e.target.value;
                this.saveSettings();
            });
        }

        // Modal
        const closeBtn = document.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.hideModal();
            });
        }

        const downloadModal = document.getElementById('download-modal');
        if (downloadModal) {
            downloadModal.addEventListener('click', (e) => {
                if (e.target.id === 'download-modal') {
                    this.hideModal();
                }
            });
        }
    }

    switchPage(page) {
        // Only handle home page since Recent and Settings are separate HTML pages
        if (page !== 'home') {
            return;
        }

        // Update navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const navBtn = document.querySelector(`[data-page="${page}"]`);
        if (navBtn) {
            navBtn.classList.add('active');
        }

        // Update pages - remove active from all first
        document.querySelectorAll('.page').forEach(p => {
            p.classList.remove('active');
        });
        
        // Show the home page
        const pageElement = document.getElementById(`${page}-page`);
        if (pageElement) {
            pageElement.classList.add('active');
            
            // Ensure welcome card is shown if no video info
            if (!this.currentVideoInfo) {
                this.showWelcomeCard();
            }
        }
    }

    switchTab(tab) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

        // Update format lists
        document.querySelectorAll('.format-list').forEach(list => {
            list.classList.remove('active');
        });
        document.getElementById(`${tab}-formats`).classList.add('active');
    }

    async getVideoFormats() {
        const url = document.getElementById('youtube-url').value.trim();
        
        if (!url) {
            this.showError('Please enter a valid media URL');
            return;
        }

        this.currentUrl = url;
        this.showLoading();
        this.hideError();
        this.hideVideoInfo();

        try {
            const requestBody = JSON.stringify({ url: url });
            const apiUrl = API_CONFIG.getApiUrl('/api/info');
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: requestBody
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch video information');
            }

            this.currentVideoInfo = data;
            this.displayVideoInfo(data);
            this.hideLoading();

        } catch (error) {
            this.hideLoading();
            this.showError(error.message);
        }
    }

    displayVideoInfo(info) {
        // Store video info for use in other methods
        this.videoInfo = info;
        
        // Update video metadata
        document.getElementById('video-title').textContent = info.title;
        document.getElementById('video-uploader').textContent = `By: ${info.uploader}`;
        document.getElementById('video-duration').textContent = `Duration: ${this.formatDuration(info.duration)}`;
        
        // Handle thumbnail with fallback and error handling
        const thumbnailImg = document.getElementById('video-thumbnail');
        this.setThumbnailWithFallback(thumbnailImg, info.thumbnail, info.extractor);

        // Update video formats
        const videoGrid = document.getElementById('video-formats-grid');
        videoGrid.innerHTML = '';

        if (info.formats.video.length === 0) {
            videoGrid.innerHTML = '<p class="no-formats">No MP4 video qualities available for this video.</p>';
        } else {
            info.formats.video.forEach(format => {
                const btn = document.createElement('button');
                btn.className = 'format-btn';
                btn.dataset.formatId = format.format_id;
                
                // Format file size display
                let sizeText = 'Size unknown';
                if (format.filesize) {
                    sizeText = this.formatFileSize(format.filesize);
                    if (format.estimated) {
                        sizeText += ' (est.)';
                    }
                }
                
                btn.innerHTML = `
                    <i class="fas fa-video"></i>
                    <span>MP4 ${format.quality}</span>
                    <small>${sizeText}</small>
                `;
                btn.addEventListener('click', () => {
                    this.downloadVideo(format.format_id, format.quality);
                });
                videoGrid.appendChild(btn);
            });
        }

        // Update audio formats
        this.generateAudioFormats();

        this.showVideoInfo();
    }

    generateAudioFormats() {
        const audioGrid = document.getElementById('audio-formats-grid');
        audioGrid.innerHTML = '';

        // Use audio formats from API response if available, otherwise fallback to defaults
        const audioFormats = this.videoInfo?.formats?.audio || [
            { quality: '128 kbps', format_id: 'bestaudio[abr<=128]', filesize: null },
            { quality: '192 kbps', format_id: 'bestaudio[abr<=192]', filesize: null },
            { quality: '256 kbps', format_id: 'bestaudio[abr<=256]', filesize: null },
            { quality: '320 kbps', format_id: 'bestaudio', filesize: null }
        ];

        audioFormats.forEach(format => {
            const btn = document.createElement('button');
            btn.className = 'format-btn';
            
            // Extract bitrate from quality string (e.g., "128 kbps" -> "128")
            const bitrate = format.quality.replace(' kbps', '');
            btn.dataset.bitrate = bitrate;
            
            // Get quality description
            const getQualityDescription = (bitrate) => {
                switch(bitrate) {
                    case '128': return 'Standard quality';
                    case '192': return 'High quality';
                    case '256': return 'Very high quality';
                    case '320': return 'Maximum quality';
                    default: return 'Audio quality';
                }
            };
            
            // Format file size if available
            let sizeInfo = '';
            if (format.filesize) {
                sizeInfo = `<small class="file-size">${this.formatFileSize(format.filesize)}</small>`;
            }
            
            btn.innerHTML = `
                <i class="fas fa-music"></i>
                <span>MP3 ${format.quality}</span>
                <small>${getQualityDescription(bitrate)}</small>
                ${sizeInfo}
            `;
            
            btn.addEventListener('click', () => {
                this.downloadAudio(bitrate);
            });
            
            audioGrid.appendChild(btn);
        });
    }

    setThumbnailWithFallback(imgElement, thumbnailUrl, extractor) {
        // Reset any previous error handlers
        imgElement.onerror = null;
        imgElement.onload = null;
        
        // If no thumbnail URL, use placeholder
        if (!thumbnailUrl) {
            imgElement.src = `/api/thumbnail/placeholder?platform=${extractor || 'unknown'}`;
            return;
        }
        
        // If it's already a local placeholder, use it directly
        if (thumbnailUrl.startsWith('/api/thumbnail/placeholder')) {
            imgElement.src = API_CONFIG.getApiUrl(thumbnailUrl);
            return;
        }
        
        // For external URLs, try direct first, then proxy on error
        imgElement.onload = () => {
            // Success - remove error handler
            imgElement.onerror = null;
        };
        
        imgElement.onerror = () => {
            // Try proxy
            const proxyUrl = API_CONFIG.getApiUrl(`/api/thumbnail/proxy?url=${encodeURIComponent(thumbnailUrl)}`);
            imgElement.onerror = () => {
                // Final fallback to placeholder
                imgElement.src = API_CONFIG.getApiUrl(`/api/thumbnail/placeholder?platform=${extractor || 'unknown'}`);
                imgElement.onerror = null; // Prevent infinite loop
            };
            imgElement.src = proxyUrl;
        };
        
        // Start with direct URL
        imgElement.src = thumbnailUrl;
    }

    async downloadVideo(formatId, quality) {
        this.showModal('Starting video download...');
        
        try {
            // Create a form to submit the download request directly
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = API_CONFIG.getApiUrl('/api/download/video');
            form.style.display = 'none';
            
            // Add form data
            const urlInput = document.createElement('input');
            urlInput.name = 'url';
            urlInput.value = this.currentUrl;
            form.appendChild(urlInput);
            
            const formatInput = document.createElement('input');
            formatInput.name = 'format_id';
            formatInput.value = formatId;
            form.appendChild(formatInput);
            
            const timestampInput = document.createElement('input');
            timestampInput.name = 'timestamp';
            timestampInput.value = Date.now();
            form.appendChild(timestampInput);
            
            document.body.appendChild(form);
            
            // Update modal to show streaming progress
            this.showModal('Download starting... Stream will begin immediately.');
            
            // Submit form to trigger direct download
            form.submit();
            
            // Clean up
            document.body.removeChild(form);
            
            // Add to recent downloads
            this.addToRecentDownloads({
                title: this.currentVideoInfo?.title || 'Unknown Video',
                type: 'video',
                quality: quality,
                url: this.currentUrl,
                formatId: formatId,
                thumbnail: this.currentVideoInfo?.thumbnail,
                timestamp: Date.now()
            });
            
            // Hide modal after a short delay
            setTimeout(() => this.hideModal(), 2000);
        } catch (error) {
            console.error('Download error:', error);
            this.hideModal();
            this.showError(`Download failed: ${error.message}`);
        }
    }

    async downloadAudio(bitrate) {
        if (!this.currentVideoInfo) {
            this.showError('Please get video information first');
            return;
        }

        this.showModal('Starting audio download...');
        
        try {
            // Create a form to submit the download request directly
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = API_CONFIG.getApiUrl('/api/download/audio');
            form.style.display = 'none';
            
            // Add form data
            const urlInput = document.createElement('input');
            urlInput.name = 'url';
            urlInput.value = this.currentUrl;
            form.appendChild(urlInput);
            
            const bitrateInput = document.createElement('input');
            bitrateInput.name = 'bitrate';
            bitrateInput.value = bitrate;
            form.appendChild(bitrateInput);
            
            const timestampInput = document.createElement('input');
            timestampInput.name = 'timestamp';
            timestampInput.value = Date.now();
            form.appendChild(timestampInput);
            
            document.body.appendChild(form);
            
            // Update modal to show streaming progress
            this.showModal('Download starting... Stream will begin immediately.');
            
            // Submit form to trigger direct download
            form.submit();
            
            // Clean up
            document.body.removeChild(form);
            
            // Add to recent downloads
            this.addToRecentDownloads({
                title: this.currentVideoInfo?.title || 'Unknown Audio',
                type: 'audio',
                quality: `${bitrate} kbps`,
                url: this.currentUrl,
                bitrate: bitrate,
                thumbnail: this.currentVideoInfo?.thumbnail,
                timestamp: Date.now()
            });
            
            // Hide modal after a short delay
            setTimeout(() => this.hideModal(), 2000);
        } catch (error) {
            console.error('Download error:', error);
            this.hideModal();
            this.showError(`Download failed: ${error.message}`);
        }
    }

    addToRecentDownloads(download) {
        // Remove duplicate if exists
        this.recentDownloads = this.recentDownloads.filter(d => 
            !(d.title === download.title && d.type === download.type && d.quality === download.quality)
        );
        
        // Add to beginning
        this.recentDownloads.unshift(download);
        
        // Keep only last 50 downloads
        this.recentDownloads = this.recentDownloads.slice(0, 50);
        
        this.saveRecentDownloads();
        this.updateRecentDownloadsUI();
    }

    updateRecentDownloadsUI() {
        const recentList = document.getElementById('recent-list');
        const emptyState = document.getElementById('recent-empty');

        // Check if elements exist (they might not be on the current page)
        if (!recentList || !emptyState) {
            return;
        }

        if (this.recentDownloads.length === 0) {
            recentList.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }

        recentList.style.display = 'block';
        emptyState.style.display = 'none';
        recentList.innerHTML = '';

        this.recentDownloads.forEach((download, index) => {
            // Validate and provide fallback values
            const title = download.title && download.title.trim() ? download.title : 'Unknown Media';
            const quality = download.quality || 'Unknown Quality';
            const type = download.type || 'video';
            const timestamp = download.timestamp || Date.now();
            
            const item = document.createElement('div');
            item.className = 'recent-item';
            item.innerHTML = `
                <div class="recent-info">
                    <h4>${title}</h4>
                    <p>${type === 'video' ? 'MP4' : 'MP3'} ${quality} • ${this.formatDate(timestamp)}</p>
                </div>
                <div class="recent-actions">
                    <button class="secondary-btn" onclick="app.redownload(${index})">
                        <i class="fas fa-download"></i> Re-download
                    </button>
                    <button class="secondary-btn" onclick="app.removeRecentDownload(${index})">
                        <i class="fas fa-trash"></i> Remove
                    </button>
                </div>
            `;
            recentList.appendChild(item);
        });
    }

    async redownload(index) {
        const download = this.recentDownloads[index];
        
        // Set current URL and get fresh info
        this.currentUrl = download.url;
        
        try {
            // Get fresh video info
            const response = await fetch(API_CONFIG.getApiUrl('/api/info'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url: download.url })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to refresh video information');
            }

            this.currentVideoInfo = data;

            // Re-download
            if (download.type === 'video') {
                this.downloadVideo(download.formatId, download.quality);
            } else {
                this.downloadAudio(download.bitrate);
            }

        } catch (error) {
            this.showError(`Re-download failed: ${error.message}`);
        }
    }

    removeRecentDownload(index) {
        if (confirm('Remove this item from recent downloads?')) {
            this.recentDownloads.splice(index, 1);
            this.saveRecentDownloads();
            this.updateRecentDownloadsUI();
        }
    }

    clearAllRecentDownloads() {
        if (confirm('Clear all recent downloads? This cannot be undone.')) {
            this.recentDownloads = [];
            this.saveRecentDownloads();
            this.updateRecentDownloadsUI();
        }
    }

    loadSettings() {
        const defaultSettings = {
            defaultVideoQuality: 'auto',
            defaultAudioBitrate: '192'
        };

        try {
            const saved = localStorage.getItem('ytd-settings');
            return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
        } catch {
            return defaultSettings;
        }
    }

    saveSettings() {
        localStorage.setItem('ytd-settings', JSON.stringify(this.settings));
    }

    loadSettingsUI() {
        const videoQualitySelect = document.getElementById('default-video-quality');
        if (videoQualitySelect) {
            videoQualitySelect.value = this.settings.defaultVideoQuality;
        }
        
        const audioBitrateSelect = document.getElementById('default-audio-bitrate');
        if (audioBitrateSelect) {
            audioBitrateSelect.value = this.settings.defaultAudioBitrate;
        }
    }

    loadRecentDownloads() {
        try {
            const saved = localStorage.getItem('ytd-recent');
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    }

    saveRecentDownloads() {
        localStorage.setItem('ytd-recent', JSON.stringify(this.recentDownloads));
    }

    showLoading() {
        document.getElementById('loading').classList.remove('hidden');
        this.hideWelcomeCard();
    }

    hideLoading() {
        document.getElementById('loading').classList.add('hidden');
        // Only show welcome card if video info is also hidden and no error is shown
        if (document.getElementById('video-info').classList.contains('hidden') && 
            document.getElementById('error-message').classList.contains('hidden')) {
            this.showWelcomeCard();
        }
    }

    showError(message) {
        const errorEl = document.getElementById('error-message');
        errorEl.innerHTML = message;
        errorEl.classList.remove('hidden');
        this.hideWelcomeCard();
    }

    hideError() {
        document.getElementById('error-message').classList.add('hidden');
        // Only show welcome card if video info is also hidden
        if (document.getElementById('video-info').classList.contains('hidden')) {
            this.showWelcomeCard();
        }
    }

    showVideoInfo() {
        document.getElementById('video-info').classList.remove('hidden');
        this.hideWelcomeCard();
    }

    hideVideoInfo() {
        document.getElementById('video-info').classList.add('hidden');
        this.showWelcomeCard();
    }

    showWelcomeCard() {
        document.getElementById('welcome-card').classList.remove('hidden');
    }

    hideWelcomeCard() {
        document.getElementById('welcome-card').classList.add('hidden');
    }

    showModal(message) {
        document.querySelector('.download-progress p').textContent = message;
        document.getElementById('download-modal').classList.remove('hidden');
    }

    hideModal() {
        document.getElementById('download-modal').classList.add('hidden');
    }

    formatDuration(seconds) {
        if (!seconds) return 'Unknown';
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }
    }

    formatFileSize(bytes) {
        if (!bytes) return 'Unknown size';
        
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
    }

    formatDate(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
            return 'Today';
        } else if (diffDays === 2) {
            return 'Yesterday';
        } else if (diffDays <= 7) {
            return `${diffDays - 1} days ago`;
        } else {
            return date.toLocaleDateString();
        }
    }
}

// Initialize the app
const app = new YouTubeDownloader();