# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import json
import os
from elasticsearch import Elasticsearch, RequestsHttpConnection
from requests_aws4auth import AWS4Auth
from elasticsearch.helpers import bulk
import boto3

## Get the information we need to establish a connection
host = os.environ.get('ENDPOINT')
region = os.environ.get('REGION')
service = 'es'
credentials = boto3.Session().get_credentials()
awsauth = AWS4Auth(credentials.access_key, credentials.secret_key, region, service, session_token=credentials.token)

## Establish the connection to Amazon Elasticsearch
es = Elasticsearch(
    hosts = [{'host': host, 'port': 443}],
    http_auth = awsauth,
    use_ssl = True,
    verify_certs = True,
    connection_class = RequestsHttpConnection
)

def lambda_handler(event, context):
    print(event)
    body = json.loads(event['body'])
    
    ## Reshape the body to have callConfigJson at the top level
    callConfig = json.loads(body.pop('callConfigJson'))
    body['signalingEndpoint'] = callConfig['signalingEndpoint']
    
    ## Add the external IP and ICE servers to the body
    body = add_ice_servers(body, callConfig)
    body = add_external_ip(body, event)

    ## Send the data to Amazon ElasticSearch
    print("Starting bulk upload")
    bulk(es, format_event(body))
    print("Completed bulk upload")

    return {
        "statusCode": "200",
        "headers": {
            "Access-Control-Allow-Origin": os.environ['CLOUDFRONT_URL'],
            'Content-Type': 'application/json',
            'Access-Control-Allow-Headers':'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'
        },
        "body": "Success"
    }

## Format the event with both request body data and audio stream level data
def format_event(body):
    softphoneStreamStatistics = body.pop('softphoneStreamStatistics')
    for stream in softphoneStreamStatistics:
        for key in ["packetsLost", "packetsCount", "audioLevel", "jitterBufferMillis", "roundTripTimeMillis"]:
            if stream[key]:
                stream[key] = int(stream[key])
        yield {
            "_index": "softphonestreamstats-",
            "_type": "document",
            "pipeline": "stats_dailyindex",
            "doc": {
                    **body,
                    "softphoneStreamType": stream['softphoneStreamType'],
                    "timestamp": stream['timestamp'],
                    "packetsLost": stream['packetsLost'],
                    "packetsCount": stream['packetsCount'],
                    "audioLevel": stream['audioLevel'],
                    "jitterBufferMillis": stream['jitterBufferMillis'],
                    "roundTripTimeMillis": stream['roundTripTimeMillis']
                    }
        }

## Take the provided ICE servers from the RTC connection and add them to the event body
def add_ice_servers(body, callConfig):
    iceServersConfig = callConfig['iceServers']
    iceServers = []
    for item in iceServersConfig:
        iceServers.append(str(item['urls'][0]).replace("?transport=udp", ""))
    iceServers = ", ".join(iceServers)
    body['iceServers'] = iceServers
    return body

## Take the external IP and add it to the event body
def add_external_ip(body, event): 
    externalIp = event['requestContext']['identity']['sourceIp']
    print(externalIp)
    body['agentPublicIp'] = externalIp
    return body