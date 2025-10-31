class Settings {
    constructor() {
        this.initializeEventListeners();
        this.loadSettingsUI();
    }

    initializeEventListeners() {
        // Video quality setting
        const videoQualitySelect = document.getElementById('default-video-quality');
        if (videoQualitySelect) {
            videoQualitySelect.addEventListener('change', (e) => {
                this.saveSetting('defaultVideoQuality', e.target.value);
            });
        }

        // Audio bitrate setting
        const audioBitrateSelect = document.getElementById('default-audio-bitrate');
        if (audioBitrateSelect) {
            audioBitrateSelect.addEventListener('change', (e) => {
                this.saveSetting('defaultAudioBitrate', e.target.value);
            });
        }
    }

    loadSettingsUI() {
        // Load video quality setting
        const videoQualitySelect = document.getElementById('default-video-quality');
        if (videoQualitySelect) {
            const savedVideoQuality = this.getSetting('defaultVideoQuality', 'auto');
            videoQualitySelect.value = savedVideoQuality;
        }

        // Load audio bitrate setting
        const audioBitrateSelect = document.getElementById('default-audio-bitrate');
        if (audioBitrateSelect) {
            const savedAudioBitrate = this.getSetting('defaultAudioBitrate', '192');
            audioBitrateSelect.value = savedAudioBitrate;
        }
    }

    getSetting(key, defaultValue = null) {
        try {
            const settings = JSON.parse(localStorage.getItem('appSettings') || '{}');
            return settings[key] || defaultValue;
        } catch (e) {
            return defaultValue;
        }
    }

    saveSetting(key, value) {
        try {
            const settings = JSON.parse(localStorage.getItem('appSettings') || '{}');
            settings[key] = value;
            localStorage.setItem('appSettings', JSON.stringify(settings));
            this.showNotification('success', 'Settings saved successfully!');
        } catch (e) {
            console.error('Failed to save setting:', e);
            this.showNotification('error', 'Failed to save settings. Please try again.');
        }
    }

    showNotification(type, message) {
        const notification = document.getElementById('settings-notification');
        const icon = notification.querySelector('.notification-icon');
        const messageEl = notification.querySelector('.notification-message');
        
        if (!notification || !icon || !messageEl) return;
        
        // Clear existing classes
        notification.className = 'notification-area';
        
        // Set type-specific styling
        if (type === 'success') {
            notification.classList.add('notification-success');
            icon.className = 'notification-icon fas fa-check-circle';
        } else if (type === 'error') {
            notification.classList.add('notification-error');
            icon.className = 'notification-icon fas fa-exclamation-circle';
        }
        
        messageEl.textContent = message;
        notification.style.display = 'block';
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            notification.style.display = 'none';
        }, 3000);
    }

    getAllSettings() {
        try {
            return JSON.parse(localStorage.getItem('appSettings') || '{}');
        } catch (e) {
            return {};
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.settings = new Settings();
});