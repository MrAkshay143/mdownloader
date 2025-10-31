class RecentDownloads {
    constructor() {
        this.initializeEventListeners();
        this.updateRecentDownloadsUI();
        this.startPeriodicUpdate();
    }

    initializeEventListeners() {
        // Clear all button
        const clearAllBtn = document.getElementById('clear-all-btn');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', () => {
                this.showConfirmDialog('clear-all');
            });
        }
    }

    startPeriodicUpdate() {
        // Update timestamps every minute
        setInterval(() => {
            this.updateRecentDownloadsUI();
        }, 60000);
    }

    updateRecentDownloadsUI() {
        const recentList = document.getElementById('recent-list');
        const emptyState = document.getElementById('recent-empty');
        
        if (!recentList || !emptyState) return;

        const downloads = this.getRecentDownloads();
        
        if (downloads.length === 0) {
            recentList.style.display = 'none';
            emptyState.style.display = 'block';
        } else {
            recentList.style.display = 'block';
            emptyState.style.display = 'none';
            
            recentList.innerHTML = downloads.map((download, index) => {
                // Handle both old and new data structures
                const title = download.title || 'Unknown Media';
                const format = download.format || (download.type === 'video' ? 'MP4' : 'MP3') + (download.quality ? ` ${download.quality}` : '');
                const date = download.date || download.timestamp;
                const id = download.id || index; // Use index as fallback ID
                
                return `
                    <div class="recent-item">
                        <div class="recent-thumbnail">
                            <img src="${this.getThumbnailUrl(download)}" 
                                  alt="${title}" 
                                  onload="this.onerror=null;"
                                  onerror="recentDownloads.handleThumbnailError(this, '${download.thumbnail || ''}', '${download.extractor || 'unknown'}');">
                        </div>
                        <div class="recent-info">
                            <div class="recent-title">${this.escapeHtml(title)}</div>
                            <div class="recent-meta">
                                <span class="recent-format">${format}</span>
                                <span class="recent-date">${this.formatDate(date)}</span>
                            </div>
                        </div>
                        <div class="recent-actions">
                            <button class="redownload-btn" onclick="recentDownloads.redownload(${index})" title="Re-download this item">
                                <i class="fas fa-download"></i>
                            </button>
                            <button class="remove-btn" onclick="recentDownloads.showConfirmDialog('remove', ${index})" title="Remove from history">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    getRecentDownloads() {
        try {
            return JSON.parse(localStorage.getItem('ytd-recent') || '[]');
        } catch (e) {
            return [];
        }
    }

    removeDownload(index) {
        const downloads = this.getRecentDownloads();
        if (index >= 0 && index < downloads.length) {
            downloads.splice(index, 1);
            localStorage.setItem('ytd-recent', JSON.stringify(downloads));
            this.updateRecentDownloadsUI();
        }
    }

    clearAllDownloads() {
        localStorage.removeItem('ytd-recent');
        this.updateRecentDownloadsUI();
    }

    showConfirmDialog(action, param = null) {
        const dialog = document.createElement('div');
        dialog.className = 'confirm-dialog-overlay';
        
        const message = action === 'clear-all' 
            ? 'Are you sure you want to clear all recent downloads?' 
            : 'Are you sure you want to remove this item from history?';
            
        dialog.innerHTML = `
            <div class="confirm-dialog">
                <div class="confirm-dialog-header">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Confirm Action</h3>
                </div>
                <div class="confirm-dialog-body">
                    <p>${message}</p>
                </div>
                <div class="confirm-dialog-actions">
                    <button class="cancel-btn" onclick="this.closest('.confirm-dialog-overlay').remove()">
                        <i class="fas fa-times"></i> Cancel
                    </button>
                    <button class="confirm-btn" onclick="recentDownloads.confirmAction('${action}', ${param !== null ? param : 'null'}); this.closest('.confirm-dialog-overlay').remove()">
                        <i class="fas fa-check"></i> Confirm
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        // Close on overlay click
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                dialog.remove();
            }
        });
        
        // Close on Escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                dialog.remove();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    }

    confirmAction(action, param) {
        if (action === 'clear-all') {
            this.clearAllDownloads();
        } else if (action === 'remove' && param !== null && param !== undefined) {
            const index = typeof param === 'number' ? param : parseInt(param);
            if (!isNaN(index) && index >= 0) {
                this.removeDownload(index);
            }
        }
    }

    async redownload(index) {
        const downloads = this.getRecentDownloads();
        const download = downloads[index];
        
        if (!download || !download.url) {
            this.showError('Invalid download item or missing URL');
            return;
        }

        this.showModal('Refreshing video information...');
        
        try {
            // Get fresh video info to handle expired links
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

            this.showModal('Starting download...');

            // Create form for download
            const form = document.createElement('form');
            form.method = 'POST';
            form.style.display = 'none';
            
            // Add URL
            const urlInput = document.createElement('input');
            urlInput.name = 'url';
            urlInput.value = download.url;
            form.appendChild(urlInput);
            
            // Add timestamp
            const timestampInput = document.createElement('input');
            timestampInput.name = 'timestamp';
            timestampInput.value = Date.now();
            form.appendChild(timestampInput);

            // Set action and add type-specific parameters
            if (download.type === 'video') {
                form.action = API_CONFIG.getApiUrl('/api/download/video');
                
                const formatIdInput = document.createElement('input');
                formatIdInput.name = 'format_id';
                formatIdInput.value = download.formatId;
                form.appendChild(formatIdInput);
                
                const qualityInput = document.createElement('input');
                qualityInput.name = 'quality';
                qualityInput.value = download.quality;
                form.appendChild(qualityInput);
            } else {
                form.action = API_CONFIG.getApiUrl('/api/download/audio');
                
                const bitrateInput = document.createElement('input');
                bitrateInput.name = 'bitrate';
                bitrateInput.value = download.bitrate;
                form.appendChild(bitrateInput);
            }

            document.body.appendChild(form);
            
            // Submit form and wait a moment before cleanup
            form.submit();
            
            // Don't remove the form immediately - let the browser handle the download
            setTimeout(() => {
                if (document.body.contains(form)) {
                    document.body.removeChild(form);
                }
            }, 1000); // Wait 1 second before cleanup

            // Update the download in recent downloads with fresh info
            const updatedDownload = {
                ...download,
                thumbnail: data.thumbnail,
                timestamp: Date.now()
            };
            
            downloads[index] = updatedDownload;
            localStorage.setItem('ytd-recent', JSON.stringify(downloads));
            this.updateRecentDownloadsUI();

            this.showModal('Download started successfully!');
            setTimeout(() => this.hideModal(), 2000);

        } catch (error) {
            console.error('Re-download error:', error);
            this.hideModal();
            this.showError(`Re-download failed: ${error.message}`);
        }
    }

    showModal(message) {
        let modal = document.getElementById('loading-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'loading-modal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="loading-spinner"></div>
                    <p id="modal-message">${message}</p>
                </div>
            `;
            document.body.appendChild(modal);
        } else {
            document.getElementById('modal-message').textContent = message;
            modal.style.display = 'flex';
        }
    }

    hideModal() {
        const modal = document.getElementById('loading-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    showError(message) {
        // Create or update error notification
        let errorDiv = document.getElementById('error-notification');
        if (!errorDiv) {
            errorDiv = document.createElement('div');
            errorDiv.id = 'error-notification';
            errorDiv.className = 'error-notification';
            document.body.appendChild(errorDiv);
        }
        
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }

    getThumbnailUrl(download) {
        // If no thumbnail, use placeholder
        if (!download.thumbnail) {
            return API_CONFIG.getApiUrl('/api/thumbnail/placeholder?platform=unknown');
        }
        
        // If it's already a local placeholder, use it directly
        if (download.thumbnail.startsWith('/api/thumbnail/placeholder')) {
            return API_CONFIG.getApiUrl(download.thumbnail);
        }
        
        // For external URLs, try direct first (proxy will be handled by onerror)
        return download.thumbnail;
    }

    handleThumbnailError(imgElement, originalUrl, extractor) {
        // If we haven't tried the proxy yet
        if (!imgElement.dataset.proxyTried && originalUrl && !originalUrl.startsWith('/api/')) {
            imgElement.dataset.proxyTried = 'true';
            
            // Try proxy
            const proxyUrl = API_CONFIG.getApiUrl(`/api/thumbnail/proxy?url=${encodeURIComponent(originalUrl)}`);
            imgElement.onerror = () => {
                // Final fallback to placeholder
                imgElement.src = API_CONFIG.getApiUrl(`/api/thumbnail/placeholder?platform=${extractor || 'unknown'}`);
                imgElement.onerror = null; // Prevent infinite loop
            };
            imgElement.src = proxyUrl;
        } else {
            // Final fallback to placeholder
            imgElement.src = `/api/thumbnail/placeholder?platform=${extractor || 'unknown'}`;
            imgElement.onerror = null; // Prevent infinite loop
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatDate(dateInput) {
        try {
            let date;
            
            // Handle different input types
            if (typeof dateInput === 'number') {
                // Timestamp (milliseconds)
                date = new Date(dateInput);
            } else if (typeof dateInput === 'string') {
                // String date
                date = new Date(dateInput);
            } else if (dateInput instanceof Date) {
                // Already a Date object
                date = dateInput;
            } else {
                // Invalid input
                return 'Unknown time';
            }
            
            // Check if date is valid
            if (isNaN(date.getTime())) {
                return 'Unknown time';
            }
            
            const now = new Date();
            const diffTime = now - date;
            
            // Handle future dates (shouldn't happen but just in case)
            if (diffTime < 0) {
                return 'Just now';
            }
            
            const diffMinutes = Math.floor(diffTime / (1000 * 60));
            const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffMinutes < 1) {
                return 'Just now';
            } else if (diffMinutes < 60) {
                return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
            } else if (diffHours < 24) {
                return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
            } else if (diffDays === 1) {
                return 'Yesterday';
            } else if (diffDays < 7) {
                return `${diffDays} days ago`;
            } else {
                // For older dates, show the actual date
                return date.toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
            }
        } catch (e) {
            console.warn('Date formatting error:', e, 'Input:', dateInput);
            return 'Unknown time';
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.recentDownloads = new RecentDownloads();
});