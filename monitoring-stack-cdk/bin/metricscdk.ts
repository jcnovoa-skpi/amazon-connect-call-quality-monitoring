#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { App } from 'aws-cdk-lib';
import awsResourcesStack = require('../lib/monitoring-stack');

const app = new App();
const stack = new awsResourcesStack.default(app,
  process.env.MONITORING_STACK_NAME
    ? process.env.MONITORING_STACK_NAME
    : 'ConnectMonitoringStack');
app.synth();
