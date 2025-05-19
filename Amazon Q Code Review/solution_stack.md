# Amazon Connect Monitoring Solution - Technology Stack

This document outlines the end-to-end technology stack used in the Amazon Connect Call Quality Monitoring solution.

## Core Technologies

### Programming Languages
- **TypeScript** (version 3.9.7): Primary language for CDK infrastructure code
- **JavaScript/Node.js**: Used for Lambda functions and custom resources

### Infrastructure as Code
- **AWS CDK** (version 1.61.1): Used for defining cloud infrastructure as code
- **AWS CloudFormation**: Underlying deployment technology used by CDK

## AWS Services

The solution leverages the following AWS services:

- **Amazon Connect**: Core contact center service being monitored
- **Amazon Kinesis**: Real-time data streaming for call metrics
- **Amazon Kinesis Firehose**: Data delivery to storage services
- **AWS Lambda** (Node.js 12.x runtime): Serverless compute for processing metrics
- **Amazon Elasticsearch Service**: Storage and analysis of call quality metrics
- **Amazon Cognito**: User authentication and authorization
- **Amazon API Gateway**: RESTful API endpoints for the solution
- **Amazon CloudFront**: Content delivery for web interface
- **Amazon S3**: Storage for web assets and data
- **Amazon DynamoDB**: NoSQL database for metadata storage
- **AWS IAM**: Identity and access management
- **Amazon CloudWatch**: Monitoring and logging
- **AWS Custom Resources**: For Kibana configuration

## Frontend Technologies

- **Web-based dashboard**: Likely built with HTML, CSS, and JavaScript
- **Kibana**: Visualization platform that runs on top of Elasticsearch

## Libraries and Dependencies

### Core Dependencies
- **uuid** (version 7.0.3): For generating unique identifiers
- **source-map-support** (version 0.5.19): For source map support in Node.js

### AWS CDK Libraries
- @aws-cdk/core (version 1.61.1)
- @aws-cdk/aws-apigateway (version 1.61.1)
- @aws-cdk/aws-cloudformation (version 1.61.1)
- @aws-cdk/aws-cloudfront (version 1.61.1)
- @aws-cdk/aws-cognito (version 1.61.1)
- @aws-cdk/aws-dynamodb (version 1.61.1)
- @aws-cdk/aws-elasticsearch (version 1.61.1)
- @aws-cdk/aws-events (version 1.61.1)
- @aws-cdk/aws-events-targets (version 1.61.1)
- @aws-cdk/aws-iam (version 1.61.1)
- @aws-cdk/aws-kinesis (version 1.61.1)
- @aws-cdk/aws-kinesisfirehose (version 1.61.1)
- @aws-cdk/aws-lambda (version 1.61.1)
- @aws-cdk/aws-lambda-event-sources (version 1.61.1)
- @aws-cdk/aws-logs (version 1.61.1)
- @aws-cdk/aws-s3 (version 1.61.1)
- @aws-cdk/aws-s3-deployment (version 1.61.1)
- @aws-cdk/custom-resources (version 1.61.1)

### Development Dependencies
- **Jest** (version 26.4.2): JavaScript testing framework
- **ts-jest** (version 26.4.1): TypeScript preprocessor for Jest
- **ts-node** (version 8.10.2): TypeScript execution environment for Node.js

### Custom Resources
- **form-data** (version 3.0.0): Library for creating form data in Node.js

## Architecture Components

The solution consists of several stacks:
1. **MonitoringStack**: Main stack that orchestrates the deployment
2. **StreamsGeneratorStack**: Handles streaming data from Amazon Connect
3. **MetricApiStack**: Provides API endpoints for metrics
4. **ElasticsearchStack**: Manages the Elasticsearch service for data storage and analysis

## Deployment Requirements

- Node.js and npm
- AWS CDK CLI (version 1.61.1 or compatible)
- TypeScript (version 3.9.7 or compatible)
- AWS CLI configured with appropriate permissions
- Amazon Connect instance with a valid CCP URL

## Integration Points

- Integrates with Amazon Connect via the Contact Control Panel (CCP)
- Uses Elasticsearch and Kibana for data visualization and analysis
- Provides real-time anomaly detection for call quality metrics
