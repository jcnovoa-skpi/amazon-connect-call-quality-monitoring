#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import cdk = require('@aws-cdk/core');
import awsResourcesStack = require('../lib/monitoring-stack');

const app = new cdk.App();
const stack = new awsResourcesStack.default(app,
  process.env.MONITORING_STACK_NAME
    ? process.env.MONITORING_STACK_NAME
    : 'ConnectMonitoringStack');
app.synth();
