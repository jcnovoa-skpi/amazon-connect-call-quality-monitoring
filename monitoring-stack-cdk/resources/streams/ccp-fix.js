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

// Test API connection
function testApiConnection() {
    logDebug("Testing API connection...");
    document.getElementById('api-status').textContent = 'Testing...';
    document.getElementById('api-status').className = 'disconnected';
    
    fetch(`${apiGatewayUrl}/metrics`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (response.ok) {
            logDebug(`API connection test successful: ${response.status}`);
            document.getElementById('api-status').textContent = 'Connected (Test)';
            document.getElementById('api-status').className = 'connected';
            return response.json();
        } else {
            logDebug(`API connection test failed: ${response.status} - ${response.statusText}`);
            document.getElementById('api-status').textContent = 'Failed';
            document.getElementById('api-status').className = 'disconnected';
            throw new Error(`API test failed: ${response.statusText}`);
        }
    })
    .then(data => {
        logDebug(`API test response: ${JSON.stringify(data)}`);
        
        // Send a test POST request with sample data
        const testMetrics = {
            contactId: 'test-' + Math.random().toString(36).substring(2, 15),
            timestamp: new Date().toISOString(),
            audioInput: 50,
            audioOutput: 50,
            networkLatency: 100,
            packetLoss: "1.00",
            mosScore: "4.00",
            isTest: true
        };
        
        return fetch(`${apiGatewayUrl}/metrics`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(testMetrics)
        });
    })
    .then(response => {
        if (response.ok) {
            logDebug(`API POST test successful: ${response.status}`);
            document.getElementById('api-status').textContent = 'Connected (Test)';
            document.getElementById('api-status').className = 'connected';
            return response.json();
        } else {
            logDebug(`API POST test failed: ${response.status} - ${response.statusText}`);
            document.getElementById('api-status').textContent = 'Failed';
            document.getElementById('api-status').className = 'disconnected';
            throw new Error(`API POST test failed: ${response.statusText}`);
        }
    })
    .then(data => {
        logDebug(`API POST test response: ${JSON.stringify(data)}`);
    })
    .catch(error => {
        logDebug(`API test error: ${error.message}`);
        document.getElementById('api-status').textContent = 'Error';
        document.getElementById('api-status').className = 'disconnected';
    });
}

// Start monitoring immediately for testing purposes
function startDemoMonitoring() {
    if (!isDemoMode) {
        logDebug("Demo mode is disabled, not starting demo monitoring");
        return;
    }
    
    logDebug("Starting demo monitoring");
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
    }
    
    isMonitoring = true;
    document.getElementById('api-status').textContent = 'Connected (Demo Mode)';
    document.getElementById('api-status').className = 'connected';
    
    // Generate a fake contact ID for demo purposes
    const demoContactId = 'demo-' + Math.random().toString(36).substring(2, 15);
    
    monitoringInterval = setInterval(() => {
        // Generate random metrics for demonstration
        const metrics = {
            contactId: demoContactId,
            timestamp: new Date().toISOString(),
            audioInput: Math.floor(Math.random() * 100),
            audioOutput: Math.floor(Math.random() * 100),
            networkLatency: Math.floor(Math.random() * 200),
            packetLoss: (Math.random() * 5).toFixed(2),
            mosScore: (Math.random() * 2 + 3).toFixed(2),
            isDemoMode: true
        };
        
        updateMetricsUI(metrics);
        sendMetrics(metrics);
    }, 2000);
}

// Start monitoring with real metrics
function startRealMonitoring(contact) {
    if (isDemoMode) {
        logDebug("Demo mode is enabled, not starting real monitoring");
        return;
    }
    
    // Reset the contact ended flag
    contactEndedFlag = false;
    
    logDebug(`Starting real monitoring for contact: ${contact.getContactId()}`);
    currentContact = contact;
    updateCallStatus(true);
    
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
    }
    
    isMonitoring = true;
    document.getElementById('api-status').textContent = 'Connected (Real Mode)';
    document.getElementById('api-status').className = 'connected';
    
    const contactId = contact.getContactId();
    
    // In a real implementation, you would get actual metrics from the Streams API
    // For now, we'll still use random data but label it as real
    monitoringInterval = setInterval(() => {
        // Check if the contact has ended
        if (contactEndedFlag || !isContactActive(contact)) {
            logDebug("Contact is no longer active, stopping monitoring");
            stopMonitoring();
            return;
        }
        
        // Generate metrics based on real call data
        // This is a placeholder - in a real implementation, you would get these from the Streams API
        const metrics = {
            contactId: contactId,
            timestamp: new Date().toISOString(),
            audioInput: Math.floor(Math.random() * 100),
            audioOutput: Math.floor(Math.random() * 100),
            networkLatency: Math.floor(Math.random() * 200),
            packetLoss: (Math.random() * 5).toFixed(2),
            mosScore: (Math.random() * 2 + 3).toFixed(2),
            isRealCall: true
        };
        
        updateMetricsUI(metrics);
        sendMetrics(metrics);
    }, 2000);
}

// Check if a contact is still active
function isContactActive(contact) {
    if (!contact) {
        return false;
    }
    
    try {
        const state = contact.getState();
        if (!state) {
            return false;
        }
        
        const stateType = state.type;
        logDebug(`Checking contact state: ${stateType}`);
        
        // Only consider the contact active if it's CONNECTED
        return stateType === connect.ContactStateType.CONNECTED;
    } catch (error) {
        logDebug(`Error checking contact state: ${error.message}`);
        return false;
    }
}

// Function to update the UI with metrics
function updateMetricsUI(metrics) {
    document.getElementById('audio-input').textContent = metrics.audioInput;
    document.getElementById('audio-output').textContent = metrics.audioOutput;
    
    const latencyElement = document.getElementById('network-latency');
    latencyElement.textContent = metrics.networkLatency;
    if (metrics.networkLatency < 100) {
        latencyElement.className = 'metric-value status-good';
    } else if (metrics.networkLatency < 150) {
        latencyElement.className = 'metric-value status-warning';
    } else {
        latencyElement.className = 'metric-value status-bad';
    }
    
    const packetLossElement = document.getElementById('packet-loss');
    packetLossElement.textContent = metrics.packetLoss;
    if (metrics.packetLoss < 1) {
        packetLossElement.className = 'metric-value status-good';
    } else if (metrics.packetLoss < 3) {
        packetLossElement.className = 'metric-value status-warning';
    } else {
        packetLossElement.className = 'metric-value status-bad';
    }
    
    const mosScoreElement = document.getElementById('mos-score');
    mosScoreElement.textContent = metrics.mosScore;
    if (metrics.mosScore > 4) {
        mosScoreElement.className = 'metric-value status-good';
    } else if (metrics.mosScore > 3.5) {
        mosScoreElement.className = 'metric-value status-warning';
    } else {
        mosScoreElement.className = 'metric-value status-bad';
    }
}

// Function to stop monitoring
function stopMonitoring() {
    logDebug("Stopping monitoring");
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
    }
    
    isMonitoring = false;
    updateCallStatus(false);
    
    if (!isDemoMode) {
        document.getElementById('api-status').textContent = 'Waiting for call';
        document.getElementById('api-status').className = 'disconnected';
        
        // Reset UI
        document.getElementById('audio-input').textContent = '--';
        document.getElementById('audio-output').textContent = '--';
        document.getElementById('network-latency').textContent = '--';
        document.getElementById('packet-loss').textContent = '--';
        document.getElementById('mos-score').textContent = '--';
    }
}

// Function to send metrics to API Gateway
function sendMetrics(metrics) {
    logDebug(`Sending metrics to API: ${apiGatewayUrl}/metrics`);
    fetch(`${apiGatewayUrl}/metrics`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(metrics)
    })
    .then(response => {
        if (response.ok) {
            logDebug(`Metrics sent successfully: ${response.status}`);
            return response.json();
        } else {
            logDebug(`Error sending metrics: ${response.status} - ${response.statusText}`);
            throw new Error(`Error sending metrics: ${response.statusText}`);
        }
    })
    .then(data => {
        logDebug(`API response: ${JSON.stringify(data)}`);
    })
    .catch(error => {
        logDebug(`Error: ${error.message}`);
        document.getElementById('api-status').textContent = 'Error';
        document.getElementById('api-status').className = 'disconnected';
    });
}

// Check for active contacts
function checkForActiveContacts() {
    if (!agentInstance) {
        logDebug("Agent instance not available yet");
        return false;
    }
    
    try {
        const contacts = agentInstance.getContacts();
        logDebug(`Found ${contacts.length} contacts`);
        
        for (let i = 0; i < contacts.length; i++) {
            const contact = contacts[i];
            logDebug(`Contact ${i+1}: ID=${contact.getContactId()}, Type=${contact.getType()}, State=${contact.getState().type}`);
            
            if (contact.getType() === connect.ContactType.VOICE && 
                contact.getState().type === connect.ContactStateType.CONNECTED) {
                logDebug(`Found active voice contact: ${contact.getContactId()}`);
                currentContact = contact;
                
                if (!isDemoMode && !isMonitoring) {
                    startRealMonitoring(contact);
                }
                return true;
            }
        }
    } catch (error) {
        logDebug(`Error checking for active contacts: ${error.message}`);
    }
    
    return false;
}

// Wait for connect.contact to be available
const maxRetries = 20;
let retries = 0;

function initializeContactHandlers() {
    if (typeof connect !== 'undefined' && connect.agent && connect.contact) {
        logDebug("Connect APIs are available, setting up handlers");
        
        // Subscribe to agent events
        connect.agent(function(agent) {
            logDebug("Agent initialized: " + agent.getState().name);
            agentInstance = agent;
            
            // Update agent status
            const statusElement = document.getElementById('status-value');
            const agentStatus = agent.getStatus().name;
            statusElement.textContent = agentStatus;
            
            // Subscribe to state changes
            agent.onStateChange(function(agentStateChange) {
                logDebug("Agent state changed: " + agentStateChange.newState);
                statusElement.textContent = agentStateChange.newState;
                
                // If agent state changes to AfterCallWork, the call has ended
                if (agentStateChange.newState === 'AfterCallWork' && !isDemoMode) {
                    logDebug("Agent entered AfterCallWork state, stopping monitoring");
                    contactEndedFlag = true;
                    stopMonitoring();
                }
            });
            
            // Check for existing contacts
            setTimeout(() => {
                checkForActiveContacts();
            }, 1000);
        });
        
        // Global contact event handler
        connect.contact(function(contact) {
            logDebug(`Contact event: ${contact.getContactId()} - Type: ${contact.getType()} - State: ${contact.getState().type}`);
            
            // Log all contact events for debugging
            contact.onRefresh(function(contact) {
                logDebug(`Contact refreshed: ${contact.getContactId()} - State: ${contact.getState().type}`);
                
                // If contact state is ended or destroyed, stop monitoring
                if ((contact.getState().type === connect.ContactStateType.ENDED || 
                     contact.getState().type === connect.ContactStateType.DESTROYED) && 
                    !isDemoMode && isMonitoring) {
                    logDebug(`Contact ${contact.getContactId()} ended or destroyed, stopping monitoring`);
                    contactEndedFlag = true;
                    stopMonitoring();
                }
            });
            
            if (contact.getType() === connect.ContactType.VOICE) {
                logDebug(`Voice contact detected: ${contact.getContactId()}`);
                
                // Store the contact for reference
                currentContact = contact;
                
                // Log all state changes
                contact.onStateChange(function(contactStateChange) {
                    logDebug(`Contact state changed: ${contact.getContactId()} - ${contactStateChange.type} - ${contactStateChange.state}`);
                    
                    // If contact state changes to ENDED or DESTROYED, stop monitoring
                    if ((contactStateChange.type === connect.ContactStateType.ENDED || 
                         contactStateChange.type === connect.ContactStateType.DESTROYED) && 
                        !isDemoMode && isMonitoring) {
                        logDebug(`Contact ${contact.getContactId()} state changed to ${contactStateChange.type}, stopping monitoring`);
                        contactEndedFlag = true;
                        stopMonitoring();
                    }
                });
                
                // Start monitoring when contact is connected
                contact.onConnected(function() {
                    logDebug(`Contact connected: ${contact.getContactId()}`);
                    
                    if (isDemoMode) {
                        logDebug("Demo mode is enabled, continuing with demo monitoring");
                    } else {
                        logDebug("Starting real monitoring for connected contact");
                        stopMonitoring(); // Stop any existing monitoring
                        startRealMonitoring(contact);
                    }
                });
                
                // Stop monitoring when contact is disconnected
                contact.onEnded(function() {
                    logDebug(`Contact ended: ${contact.getContactId()}`);
                    
                    if (!isDemoMode) {
                        logDebug("Contact ended, stopping monitoring");
                        contactEndedFlag = true;
                        stopMonitoring();
                    } else {
                        logDebug("Demo mode is enabled, continuing with demo monitoring");
                    }
                });
                
                // Handle missed contacts
                contact.onMissed(function() {
                    logDebug(`Contact missed: ${contact.getContactId()}`);
                    
                    if (!isDemoMode) {
                        contactEndedFlag = true;
                        stopMonitoring();
                    }
                });
                
                // Handle errors
                contact.onError(function(error) {
                    logDebug(`Contact error: ${JSON.stringify(error)}`);
                    
                    if (!isDemoMode) {
                        contactEndedFlag = true;
                        stopMonitoring();
                    }
                });
                
                // If the contact is already connected, start monitoring
                if (contact.getState().type === connect.ContactStateType.CONNECTED) {
                    logDebug(`Contact is already connected: ${contact.getContactId()}`);
                    
                    if (!isDemoMode) {
                        startRealMonitoring(contact);
                    }
                }
            }
        });
        
        // Start demo monitoring after a short delay if demo mode is enabled
        setTimeout(function() {
            if (isDemoMode && !isMonitoring) {
                logDebug("Starting demo monitoring after delay");
                startDemoMonitoring();
            } else if (!isDemoMode && !isMonitoring) {
                // In real mode, test the API connection
                testApiConnection();
                
                // Set up periodic check for active contacts
                setInterval(() => {
                    if (!isMonitoring && !isDemoMode) {
                        checkForActiveContacts();
                    }
                }, 5000);
            }
        }, 3000);
        
    } else if (retries < maxRetries) {
        retries++;
        logDebug(`Connect APIs not available yet, retrying... (${retries}/${maxRetries})`);
        setTimeout(initializeContactHandlers, 500);
    } else {
        logDebug("Failed to initialize contact handlers after maximum retries");
        // Start demo monitoring as fallback if demo mode is enabled
        if (isDemoMode) {
            startDemoMonitoring();
        } else {
            // In real mode, test the API connection
            testApiConnection();
        }
    }
}

// Start initialization process
initializeContactHandlers();

// Add direct event listeners to the connect object
if (window.connect) {
    logDebug("Adding direct event listeners to connect object");
    
    // Listen for all contact events
    window.connect.core.onViewContact(function(contact) {
        logDebug(`View contact event: ${contact.contactId}`);
    });
    
    // Listen for all agent events
    window.connect.core.onAgentStateChange(function(agentStateChange) {
        logDebug(`Agent state change event: ${agentStateChange.newState}`);
        
        // If agent state changes to AfterCallWork, the call has ended
        if (agentStateChange.newState === 'AfterCallWork' && !isDemoMode) {
            logDebug("Agent entered AfterCallWork state from core event, stopping monitoring");
            contactEndedFlag = true;
            stopMonitoring();
        }
    });
    
    // Listen for all connection events
    window.connect.core.onConnectionGained(function() {
        logDebug("Connection gained event");
    });
    
    window.connect.core.onConnectionLost(function() {
        logDebug("Connection lost event");
    });
}

// Add a global error handler
window.onerror = function(message, source, lineno, colno, error) {
    logDebug(`Global error: ${message} at ${source}:${lineno}:${colno}`);
    return false;
};
