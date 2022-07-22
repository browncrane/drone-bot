import boto3
import time 

client = boto3.client('logs')
response = client.describe_log_streams(
    logGroupName='/aws/eks/cluster',
    orderBy='LastEventTime',
    descending=True,
    limit=10
)
log_stream = response.get('logStreams')
if not log_stream or len(log_stream) == 0: 
    print('no log')
last_event_time = log_stream[0].get('lastEventTimestamp')
current_time = int(time.time())
print(current_time-(last_event_time/1000))
