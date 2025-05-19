# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import json
import boto3


def lambda_handler(event, context):
    # TODO implement
    
    sqs = boto3.resource('sqs')

    # Get the queue
    queue = sqs.get_queue_by_name(QueueName='fakeCCPstreamsStatsQueue')
    
    # Create a new message
    for i in range(5000):
        queue.send_message(MessageBody='world')
    
    return {
        'statusCode': 200,
        'body': json.dumps('Hello from Lambda!')
    }
