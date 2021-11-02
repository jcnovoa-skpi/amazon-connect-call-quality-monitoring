# This stack has been deprecated

# Amazon Connect Monitoring Deployment Guide
## Deploying the app
### CCP URL
This parameter is the URL you use to access the Contact Control Panel. For example, if my instance is named 'monitoring-test' it would be https://monitoring-test.awsapps.com/connect/ccp-v2

### SAML URL
If you use SAML to authenticate users, enter your SAML URL. If not, leave this field blank.

Then click deploy! For a guide with pictures please follow the link to our  [GitHub Repo](https://github.com/amazon-connect/amazon-connect-call-quality-monitoring)

### Amazon Elasticsearch

By default the stack deploys an Amazon Elasticsearch cluster to store and visualize the telemetry data.  

### Splunk

If you would like to integrate with your existing Splunk cluster please provide your Splunk URL and HEC token.

## Post-Deploy Steps
### Whitelisting your CloudFront URL
The custom, metrics-enabled softphone is hosted on Cloudfront. To access the custom CCP, we also need to whitelist the CloudFront URL from our Connect instance. We can do this from the AWS Console for Connect. From the console where you found your Instance ID
 * Click Application Integration on the left hand side
 * Copy the value from the [CloudFront URL Parameter](https://console.aws.amazon.com/systems-manager/parameters/CloudfrontUrl/description?&tab=Table)
 * Click 'Add Origin'
 * Paste the value
### Creating Cognito Users to View Metrics
Now we need to create Cognito users to access Kibana, the visualization tool to analyze our data and view dashboards.
  * Get the [URL to create users](https://console.aws.amazon.com/systems-manager/parameters/UserCreationUrl/description?&tab=Table)
  * Visit the URL from your browser
  * Click 'Create User' and supply a valid email address. Optionally include a phone number. Require validation as you see fit.
### Access the Kibana Instance
Using the previously created user, we can now view Kibana.
  * Copy the [Kibana URL from the Parameter](https://console.aws.amazon.com/systems-manager/parameters/KibanaUrl/description?&tab=Table)
  * Sign in with the user
