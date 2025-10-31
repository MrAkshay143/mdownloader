// API Configuration
const API_CONFIG = {
    // Production API URL (deployed API endpoint) - will be updated after deployment
    PRODUCTION_API: 'https://mdownloader.vercel.app',
    
    // Local development API URL
    LOCAL_API: 'http://localhost:5000',
    
    // Auto-detect environment and set base URL
    getBaseUrl() {
        // Check if we're running on localhost or local development
        const isLocal = window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1' || 
                       window.location.hostname === '';
        
        // For production deployment on Vercel, use same domain (relative URL)
        // For local development, use local Flask server
        if (isLocal) {
            return this.LOCAL_API;
        } else {
            // Use relative URLs for production (same domain)
            return '';
        }
    },
    
    // Get full API endpoint URL
    getApiUrl(endpoint) {
        const baseUrl = this.getBaseUrl();
        return baseUrl + endpoint;
    }
};

// Export for use in other scripts
window.API_CONFIG = API_CONFIG;