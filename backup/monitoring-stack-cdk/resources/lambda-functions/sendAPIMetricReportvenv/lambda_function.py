import json
import os
from elasticsearch import Elasticsearch, RequestsHttpConnection
from requests_aws4auth import AWS4Auth
from elasticsearch.helpers import bulk
import boto3


def lambda_handler(event, context):
    # print(type(event))
    body = json.loads(event['body'])
    print(body)

    host = os.environ.get('ENDPOINT')
    region = os.environ.get('REGION')
    service = 'es'
    credentials = boto3.Session().get_credentials()
    awsauth = AWS4Auth(credentials.access_key, credentials.secret_key, region, service, session_token=credentials.token)

    es = Elasticsearch(
        hosts = [{'host': host, 'port': 443}],
        http_auth = awsauth,
        use_ssl = True,
        verify_certs = True,
        connection_class = RequestsHttpConnection
    )
    print("Starting bulk upload")
    bulk(es, gendata(body))
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

def gendata(body):
    for metric in body['API_METRIC']:
        yield {
            "_index": "apimetric-",
            "pipeline": "apimetrics_dailyindex",
            "_type": "document",
            "doc": {
                    "agent": body['agent'],
                    "timestamp": metric['timestamp'],
                    metric['name']: metric['time']  
                    }
        }

