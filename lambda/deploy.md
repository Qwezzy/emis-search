# Lambda Deployment Guide

## Prerequisites
- AWS CLI installed and configured (`aws configure`)
- Node.js 20+
- An AWS account

> **Bedrock model access:** Models are automatically enabled on first invocation — no manual activation needed. First-time Anthropic model users may be prompted to submit brief use case details the first time a model is called. This only happens once.

---

## Step 1 – Create the IAM role

```bash
# Create the Lambda execution role
aws iam create-role \
  --role-name emis-search-lambda-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": { "Service": "lambda.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }]
  }'

# Attach the Bedrock + CloudWatch Logs policy
aws iam put-role-policy \
  --role-name emis-search-lambda-role \
  --policy-name emis-bedrock-policy \
  --policy-document file://iam-policy.json
```

Note the `Role.Arn` value from the first command output — you'll need it in Step 2.
It looks like: `arn:aws:iam::123456789012:role/emis-search-lambda-role`

---

## Step 2 – Build and deploy the Lambda

```bash
# Install dependencies
npm install

# Bundle index.mjs + all SDK code into dist/lambda.zip
npm run build

# Create the Lambda function (replace ROLE_ARN with the ARN from Step 1)
aws lambda create-function \
  --function-name emis-search-ai \
  --runtime nodejs20.x \
  --handler index.handler \
  --role ROLE_ARN \
  --zip-file fileb://dist/lambda.zip \
  --timeout 30 \
  --memory-size 256 \
  --environment "Variables={BEDROCK_REGION=us-east-1}" \
  --region us-east-1
```

For subsequent code updates after rebuilding:
```bash
aws lambda update-function-code \
  --function-name emis-search-ai \
  --zip-file fileb://dist/lambda.zip \
  --region us-east-1
```

---

## Step 3 – Create the API Gateway (HTTP API)

Run these commands in sequence, substituting values from each response into the next.

```bash
# 1. Create the HTTP API — note the ApiId in the response
aws apigatewayv2 create-api \
  --name emis-search-api \
  --protocol-type HTTP \
  --cors-configuration AllowOrigins='["*"]',AllowMethods='["POST","OPTIONS"]',AllowHeaders='["Content-Type"]' \
  --region us-east-1
```

```bash
# 2. Create the Lambda integration — note the IntegrationId in the response
#    Replace API_ID and ACCOUNT_ID with your values
aws apigatewayv2 create-integration \
  --api-id API_ID \
  --integration-type AWS_PROXY \
  --integration-uri arn:aws:lambda:us-east-1:ACCOUNT_ID:function:emis-search-ai \
  --payload-format-version 2.0 \
  --region us-east-1
```

```bash
# 3. Create the POST /ai route
#    Replace API_ID and INTEGRATION_ID with your values
aws apigatewayv2 create-route \
  --api-id API_ID \
  --route-key "POST /ai" \
  --target "integrations/INTEGRATION_ID" \
  --region us-east-1
```

```bash
# 4. Deploy to a "prod" stage
aws apigatewayv2 create-stage \
  --api-id API_ID \
  --stage-name prod \
  --auto-deploy \
  --region us-east-1
```

```bash
# 5. Allow API Gateway to invoke the Lambda
aws lambda add-permission \
  --function-name emis-search-ai \
  --statement-id apigateway-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --region us-east-1
```

Your endpoint will be:
```
https://API_ID.execute-api.us-east-1.amazonaws.com/prod/ai
```

---

## Step 4 – Wire up the frontend

Open `../ai.js` and set the endpoint:

```javascript
const AI_ENDPOINT = "https://API_ID.execute-api.us-east-1.amazonaws.com/prod/ai";
```

---

## Step 5 – Test the endpoint

```bash
# Test the parse action
curl -X POST https://API_ID.execute-api.us-east-1.amazonaws.com/prod/ai \
  -H "Content-Type: application/json" \
  -d '{"action":"parse","query":"rural no-fee primary schools in Eastern Cape"}'
```

Expected response:
```json
{"filters":{"p":"EC","ph":"Primary School","f":"0","u":"0"},"freeText":"","rawQuery":"rural no-fee primary schools in Eastern Cape"}
```

```bash
# Test the chat action
curl -X POST https://API_ID.execute-api.us-east-1.amazonaws.com/prod/ai \
  -H "Content-Type: application/json" \
  -d '{"action":"chat","message":"What does quintile 1 mean for a South African school?"}'
```

---

## Choosing a model

The default is **Claude 3 Haiku** — fast and cheap, well suited for filter parsing.

| Model | Speed | Input cost | Best for |
|---|---|---|---|
| Claude 3 Haiku (default) | Very fast | ~$0.25 / 1M tokens | Parse queries |
| Claude 3.5 Haiku | Fast | ~$0.80 / 1M tokens | Better reasoning |
| Claude 3 Sonnet | Moderate | ~$3.00 / 1M tokens | Complex chat |

To switch models after deployment:
```bash
aws lambda update-function-configuration \
  --function-name emis-search-ai \
  --environment "Variables={BEDROCK_REGION=us-east-1,MODEL_ID=anthropic.claude-3-5-haiku-20241022-v1:0}" \
  --region us-east-1
```

Valid `MODEL_ID` values:
- `anthropic.claude-3-haiku-20240307-v1:0` (default)
- `anthropic.claude-3-5-haiku-20241022-v1:0`
- `anthropic.claude-3-sonnet-20240229-v1:0`
- `anthropic.claude-3-5-sonnet-20241022-v2:0`

---

## Environment variables reference

| Variable | Default | Description |
|---|---|---|
| `BEDROCK_REGION` | `us-east-1` | AWS region for Bedrock calls |
| `MODEL_ID` | `anthropic.claude-3-haiku-20240307-v1:0` | Bedrock model to use |

> **Region note:** Bedrock is not available in all regions. `us-east-1` and `us-west-2` have the broadest model availability. If your Lambda is in a different region, set `BEDROCK_REGION` explicitly to one that supports Anthropic models.

---

## Troubleshooting

**403 / AccessDeniedException from Bedrock**
The IAM role is missing the `bedrock:InvokeModel` permission, or the model ID is wrong. Check the role policy with:
```bash
aws iam get-role-policy \
  --role-name emis-search-lambda-role \
  --policy-name emis-bedrock-policy
```

**"First-time Anthropic user" prompt**
If Bedrock returns a use case prompt on first invocation, go to the [Bedrock Model Catalog](https://console.aws.amazon.com/bedrock/home#/models), find Claude 3 Haiku, and complete the one-time form. The Lambda will work normally on all subsequent calls.

**Lambda timeout**
Bedrock can occasionally take 10–15 seconds for the first cold-start call. The Lambda is set to 30s timeout which covers this. If you see consistent timeouts, increase it:
```bash
aws lambda update-function-configuration \
  --function-name emis-search-ai \
  --timeout 60 \
  --region us-east-1
```

**CORS errors in the browser**
The API Gateway is configured with `AllowOrigins: ["*"]`. If you restrict the origin after deployment, update the CORS config:
```bash
aws apigatewayv2 update-api \
  --api-id API_ID \
  --cors-configuration AllowOrigins='["https://yourdomain.com"]',AllowMethods='["POST","OPTIONS"]',AllowHeaders='["Content-Type"]' \
  --region us-east-1
```
