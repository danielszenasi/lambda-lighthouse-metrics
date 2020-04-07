1. Create a new Customer managed keys in aws console
2. Create a Slack app and a webhook for your channel
3. echo -n <'webhookUrl'> | base64 > message.txt
4. aws kms encrypt --key-id <KeyID> --plaintext file://message.txt --query CiphertextBlob --output text > message.encrypted.base64
