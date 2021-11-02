# Amazon Connect Monitoring Solution
Welcome to the Amazon Connect Monitoring Solution Github repository, here you can find all the technical artifacts related to the solution.


## CDK deployment

To deploy the CDK locally

```
git clone git@github.com:amazon-connect/amazon-connect-call-quality-monitoring.git

npm install -g aws-cdk
npm install -g typescript
cdk --version
export ACCOUNT_ID=`aws sts get-caller-identity --query Account --output text`
export AWS_REGION=YOURREGION
cdk bootstrap aws://$ACCOUNT_ID/$AWS_REGION

export CCP_URL=YOURURL
cd Amazon-connect-monitoring/monitoring-stack-cdk
npm install
cdk deploy --require-approval never
```


Here are some relevant documents:

- [Deployment guide](https://amazon-connect.github.io/amazon-connect-call-quality-monitoring/en/deployment-guide.html)
- [User guide](https://amazon-connect.github.io/amazon-connect-call-quality-monitoring/en/user-guide.html)
- [Application Architecture](https://amazon-connect.github.io/amazon-connect-call-quality-monitoring/en/application-architecture.html)
- [Data Model](https://amazon-connect.github.io/amazon-connect-call-quality-monitoring/en/data-model.html)
- [Operations guide](https://amazon-connect.github.io/amazon-connect-call-quality-monitoring/en/operations-guide.html)
- [Anomaly detection](https://aws.amazon.com/blogs/machine-learning/real-time-anomaly-detection-for-amazon-connect-call-quality-using-amazon-es/)




If you have any issues please don't hesitate to open up a Github issue. 
