# Amazon Connect CCP Integration Guide

## Overview

This guide explains how to integrate the Amazon Connect Contact Control Panel (CCP) with the Call Quality Monitoring solution. The integration allows you to monitor call quality metrics in real-time and store them for analysis.

## Prerequisites

- An Amazon Connect instance
- The deployed Call Quality Monitoring solution
- Administrator access to Amazon Connect

## Integration Steps

### 1. Access the CCP Integration

The CCP integration is available at:
```
https://d3tambatyz270p.cloudfront.net/ccp.html
```

This page combines the Amazon Connect CCP with real-time call quality monitoring.

### 2. Configure Amazon Connect Approved Origins

To allow the integration to work, you need to add the CloudFront domain to your Amazon Connect approved origins:

1. Go to the AWS Console and navigate to Amazon Connect
2. Select your instance
3. Go to "Application integration" in the left navigation
4. Under "Approved origins", add:
   ```
   https://d3tambatyz270p.cloudfront.net
   ```
5. Click "Add origin" and then "Save"

### 3. Demo Mode vs. Real Mode

The CCP integration includes a toggle switch to enable or disable Demo Mode:

- **Demo Mode ON**: Generates simulated metrics even when no call is active
- **Demo Mode OFF**: Only shows metrics during actual calls

To switch between modes:
1. Use the toggle switch at the top of the metrics panel
2. The mode indicator will show "DEMO MODE ON" or "REAL MODE ON"
3. Your preference will be saved in your browser's local storage

You can also set the mode via URL parameter:
```
https://d3tambatyz270p.cloudfront.net/ccp.html?demo=false
```

### 4. Fixed Call Monitoring

The updated integration now properly handles call lifecycle:

- Properly detects when calls start and end
- Stops sending metrics when a call ends
- Checks multiple call state indicators to ensure accuracy
- Uses a contact ended flag to prevent monitoring after call completion

### 5. Debug Information

The integration includes an enhanced debug panel:

- Shows detailed logs of all events and API calls
- Includes a "Clear" button to reset the log
- Displays timestamps for all activities
- Logs all Connect events for troubleshooting

### 6. Testing API Connection

The integration includes a "Test API Connection" button that allows you to:

1. Verify connectivity to the API Gateway
2. Send a test request to ensure the API is working properly
3. Check if metrics are being properly received by the backend

This is especially useful when in Real Mode to ensure everything is properly configured before making a call.

### 7. Update the CCP URL in the Integration (Optional)

The CCP integration page is configured to use the demo-successkpi Connect instance by default:
```javascript
const connectUrl = urlParams.get('connect') || "https://demo-successkpi.my.connect.aws/ccp-v2/";
```

If you need to use a different Connect instance, you can pass it as a query parameter:
```
https://d3tambatyz270p.cloudfront.net/ccp.html?connect=https://your-instance.my.connect.aws/ccp-v2/
```

### 8. API Gateway Configuration

The CCP integration is already configured to send metrics to the API Gateway endpoint:
```javascript
const apiGatewayUrl = urlParams.get('api') || 'https://kq6mr06ju8.execute-api.us-east-1.amazonaws.com/prod';
```

If you need to use a different API Gateway endpoint, you can pass it as a query parameter:
```
https://d3tambatyz270p.cloudfront.net/ccp.html?api=https://your-api-gateway-url.execute-api.us-east-1.amazonaws.com/prod
```

### 9. Test the Integration

1. Open the CCP integration URL in your browser:
   ```
   https://d3tambatyz270p.cloudfront.net/ccp.html
   ```
2. Log in with your Amazon Connect credentials
3. Toggle Demo Mode ON or OFF based on your testing needs
4. If in Real Mode, click "Test API Connection" to verify connectivity
5. Make or receive a test call
6. Observe the real-time metrics displayed on the right side of the screen
7. Verify that metrics are being sent to OpenSearch by checking the OpenSearch Dashboards at:
   ```
   https://search-opensearchdomai-pxrdssnvudx1-we2fmfytgoikdgieytwdccagwu.us-east-1.es.amazonaws.com/_dashboards/
   ```
8. When the call ends, verify that metrics stop being sent

## Metrics Collected

The CCP integration collects and displays the following metrics:

1. **Audio Input Level**: The volume level of the agent's microphone
2. **Audio Output Level**: The volume level of the customer's voice
3. **Network Latency**: The delay in milliseconds between sending and receiving audio
4. **Packet Loss**: The percentage of audio packets lost during transmission
5. **MOS Score**: Mean Opinion Score, a measure of call quality (1-5, with 5 being excellent)

## Troubleshooting

If you encounter issues with the CCP integration:

1. Check the debug panel for error messages
2. Use the "Test API Connection" button to verify API connectivity
3. Verify that the Amazon Connect instance URL is correct
4. Ensure the CloudFront domain is added to the approved origins in Amazon Connect
5. Check that the API Gateway URL is correct and accessible
6. Verify that the Cognito user has the necessary permissions to access OpenSearch

### Common Issues and Solutions

1. **Metrics Continue After Call Ends**
   - This issue has been fixed in the latest version
   - If you still experience this, try refreshing the page
   - Check the debug logs for any unusual call state transitions
   - Verify that the "Contact ended" event is being properly detected

2. **No Active Call Detected**
   - Check if you're logged in to Amazon Connect
   - Verify that your agent status is set to "Available"
   - Try refreshing the page and making a new call
   - Check the debug logs for any connection errors

3. **API Connection Shows "Disconnected"**
   - Click the "Test API Connection" button to verify connectivity
   - Check if your network allows connections to the API Gateway
   - Verify that the API Gateway endpoint is correct
   - Check the debug logs for any API errors

## Additional Resources

- [Amazon Connect Streams API Documentation](https://github.com/amazon-connect/amazon-connect-streams)
- [OpenSearch Dashboards Documentation](https://opensearch.org/docs/latest/dashboards/index/)
- [Amazon Connect Administration Guide](https://docs.aws.amazon.com/connect/latest/adminguide/what-is-amazon-connect.html)
