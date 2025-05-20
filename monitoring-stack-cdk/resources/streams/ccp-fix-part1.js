// Global variables
let currentContact = null;
let monitoringInterval = null;
let isMonitoring = false;
let isDemoMode = true; // Default to demo mode
let hasActiveCall = false;
let agentInstance = null;
let contactEndedFlag = false;

// Initialize toggle state from URL parameter or localStorage
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('demo')) {
    isDemoMode = urlParams.get('demo') === 'true';
} else if (localStorage.getItem('demoMode') !== null) {
    isDemoMode = localStorage.getItem('demoMode') === 'true';
}

// Set initial toggle state
document.getElementById('demo-mode-toggle').checked = isDemoMode;
updateModeIndicator();

// Add event listener to toggle
document.getElementById('demo-mode-toggle').addEventListener('change', function(e) {
    isDemoMode = e.target.checked;
    localStorage.setItem('demoMode', isDemoMode);
    updateModeIndicator();
    
    // If we're currently monitoring, restart with the new mode
    if (isMonitoring) {
        stopMonitoring();
        if (isDemoMode) {
            startDemoMonitoring();
        } else if (currentContact && hasActiveCall) {
            startRealMonitoring(currentContact);
        }
    } else if (isDemoMode) {
        // If we're not monitoring but demo mode is enabled, start demo monitoring
        startDemoMonitoring();
    }
    
    logDebug(`Demo mode ${isDemoMode ? 'enabled' : 'disabled'}`);
});

// Add event listener to test API button
document.getElementById('test-api-btn').addEventListener('click', function() {
    testApiConnection();
});

// Add event listener to clear debug button
document.getElementById('clear-debug-btn').addEventListener('click', function() {
    document.getElementById('debug-info').innerHTML = '';
    logDebug('Debug log cleared');
});

// Update the mode indicator
function updateModeIndicator() {
    const indicator = document.getElementById('mode-indicator');
    if (isDemoMode) {
        indicator.textContent = 'DEMO MODE ON';
        indicator.className = 'mode-indicator mode-demo';
    } else {
        indicator.textContent = 'REAL MODE ON';
        indicator.className = 'mode-indicator mode-real';
    }
}

// Update call status indicator
function updateCallStatus(active) {
    hasActiveCall = active;
    const statusElement = document.getElementById('call-status');
    if (active) {
        statusElement.textContent = 'Active Call';
        statusElement.className = 'call-status call-active';
    } else {
        statusElement.textContent = 'No Active Call';
        statusElement.className = 'call-status call-inactive';
    }
}

// Debug logging function
function logDebug(message) {
    const debugElement = document.getElementById('debug-info');
    const timestamp = new Date().toISOString();
    debugElement.innerHTML += `<div>[${timestamp}] ${message}</div>`;
    console.log(`[${timestamp}] ${message}`);
    // Auto-scroll to bottom
    debugElement.scrollTop = debugElement.scrollHeight;
}

// Get the API Gateway URL from the query string or use the actual deployed API Gateway URL
const apiGatewayUrl = urlParams.get('api') || 'https://kq6mr06ju8.execute-api.us-east-1.amazonaws.com/prod';
logDebug(`API Gateway URL: ${apiGatewayUrl}`);

// Get the Connect URL from the query string or use the default
const connectUrl = urlParams.get('connect') || "https://demo-successkpi.my.connect.aws/ccp-v2/";
logDebug(`Connect URL: ${connectUrl}`);

// Initialize the CCP
logDebug("Initializing CCP...");
connect.core.initCCP(document.getElementById("ccp-container"), {
    ccpUrl: connectUrl,
    loginPopup: true,
    softphone: {
        allowFramedSoftphone: true
    }
});
logDebug("CCP initialization complete");
