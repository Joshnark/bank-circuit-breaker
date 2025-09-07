# Bank Circuit Breaker System

A comprehensive banking service circuit breaker implementation using AWS Lambda, DynamoDB, CloudWatch, and SQS for automatic failover and recovery management.

## 🏗️ Architecture Overview

The circuit breaker system consists of three service levels with automatic transitions based on failure thresholds:

- **Level 1 (Full Service)**: Complete functionality with 5% simulated failure rate
- **Level 2 (Degraded Service)**: Partial functionality with 2% simulated failure rate  
- **Level 3 (Maintenance Mode)**: Minimal functionality with 10% simulated failure rate

### System Flow

```
Services (Level 1-3) → CloudWatch Metrics → CloudWatch Alarms → SNS → SQS → Alarm Processor → DynamoDB → Controller
```

## 📁 Project Structure

```
bank-circuit-breaker/
├── circuit-breaker-controller/     # Main controller Lambda
│   ├── index.js
│   └── package.json
├── full-service/                   # Level 1 service
│   ├── index.js
│   └── package.json
├── degraded-service/              # Level 2 service
│   ├── index.js
│   └── package.json
├── maintenance-service/           # Level 3 service
│   ├── index.js
│   └── package.json
├── alarm-processor/               # Processes CloudWatch alarms
│   ├── index.js
│   └── package.json
├── shared/                        # Shared modules
│   └── dynamodb-operations.js    # DynamoDB state management
├── infrastructure/               # AWS infrastructure
│   ├── circuit-breaker-infrastructure.yaml
│   ├── cloudwatch-alarms.json
│   └── deploy.sh
└── README.md
```

## 🔄 Circuit Breaker Logic

### Transition Thresholds

| Transition | Condition | Threshold |
|------------|-----------|-----------|
| Level 1 → 2 | Error count | ≥ 5 failures |
| Level 2 → 3 | Error count | ≥ 10 total failures |
| Level 3 → 2 | Success streak | ≥ 3 consecutive successes |
| Level 2 → 1 | Success streak | ≥ 5 consecutive successes |

### State Management

The system maintains state in DynamoDB with the following structure:

```json
{
  "pk": "system-state",
  "currentLevel": 1,
  "failureCount": 0,
  "successCount": 0,
  "lastTransition": "2024-01-01T00:00:00Z",
  "lastUpdated": "2024-01-01T00:00:00Z",
  "transitionReason": "Initial state"
}
```

## 🚀 Quick Start

### 1. Deploy Infrastructure

```bash
cd infrastructure
./deploy.sh --environment dev --region us-east-1
```

### 2. Set Environment Variables

After infrastructure deployment, update Lambda environment variables:

```bash
export STATE_TABLE="bank-circuit-breaker-circuit-breaker-state-dev"
export FULL_SERVICE_FUNCTION="arn:aws:lambda:region:account:function:full-service"
export DEGRADED_SERVICE_FUNCTION="arn:aws:lambda:region:account:function:degraded-service"
export MAINTENANCE_SERVICE_FUNCTION="arn:aws:lambda:region:account:function:maintenance-service"
```

### 3. Deploy Lambda Functions

Deploy each service with the appropriate IAM role from the infrastructure stack.

### 4. Test the System

```bash
# Check circuit breaker status
curl -X GET https://your-api-gateway-url/circuit-breaker

# Test a service endpoint
curl -X GET https://your-api-gateway-url/account/12345
```

## 📊 Monitoring & Dashboards

### CloudWatch Metrics

The system publishes the following metrics:

#### Service Metrics (`CircuitBreaker/Service`)
- `Success` - Successful service calls
- `Error` - Failed service calls  
- `ResponseTime` - Service response times

#### Controller Metrics (`CircuitBreaker/Controller`)
- `Invocation` - Controller invocations
- `CurrentLevel` - Current circuit breaker level
- `FailureCount` - Current failure count
- `SuccessCount` - Current success count
- `ResponseTime` - Controller response time

#### Alarm Processor Metrics (`CircuitBreaker/AlarmProcessor`)
- `RecordsProcessed` - SQS records processed
- `ProcessingErrors` - Processing errors
- `FailureAlarmProcessed` - Failure alarms processed
- `RecoveryAlarmProcessed` - Recovery alarms processed

### CloudWatch Alarms

The system includes the following alarms:

1. **Level 1 Error Rate** - Triggers Level 1→2 transition
2. **Level 2 Error Rate** - Triggers Level 2→3 transition  
3. **Level 3 Recovery** - Triggers Level 3→2 recovery
4. **Level 2 Recovery** - Triggers Level 2→1 recovery
5. **Controller Errors** - Monitors controller health
6. **Alarm Processor Errors** - Monitors alarm processing

### Dashboard

Access the CloudWatch dashboard at:
```
https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=bank-circuit-breaker-CircuitBreakerMonitoring-dev
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `STATE_TABLE` | DynamoDB table name | `circuit-breaker-state` |
| `FULL_SERVICE_FUNCTION` | Level 1 service ARN | `full-service` |
| `DEGRADED_SERVICE_FUNCTION` | Level 2 service ARN | `degraded-service` |  
| `MAINTENANCE_SERVICE_FUNCTION` | Level 3 service ARN | `maintenance-service` |

### Service Configuration

Each service can be configured with different failure rates for testing:

```javascript
// In service code
const shouldFail = Math.random() < 0.05; // 5% failure rate
```

## 🧪 Testing

### Manual Testing

1. **Test Normal Operation**
   ```bash
   # Should return Level 1 response
   curl -X GET https://api-url/account/12345
   ```

2. **Trigger Failures**
   ```bash
   # Make multiple requests to trigger failures
   for i in {1..20}; do curl -X GET https://api-url/account/12345; done
   ```

3. **Check Circuit Breaker Status**
   ```bash
   curl -X GET https://api-url/circuit-breaker
   ```

### Automated Testing

Create test scripts to simulate different failure scenarios and verify transitions.

## 📈 Performance Characteristics

### Service Response Times
- **Level 1 (Full)**: 50-150ms (includes full database queries)
- **Level 2 (Degraded)**: 20-70ms (cached data only)
- **Level 3 (Maintenance)**: 10-30ms (minimal processing)

### Failure Rates (Simulated)
- **Level 1**: 5% failure rate
- **Level 2**: 2% failure rate
- **Level 3**: 10% failure rate (maintenance responses)

## 🔒 Security Considerations

1. **IAM Roles**: Each Lambda has minimal required permissions
2. **Data Encryption**: DynamoDB encryption at rest enabled
3. **VPC**: Consider deploying Lambdas in VPC for additional security
4. **Secrets**: No hardcoded credentials or secrets

## 🐛 Troubleshooting

### Common Issues

1. **DynamoDB Permission Errors**
   - Verify IAM role has DynamoDB access
   - Check table name in environment variables

2. **CloudWatch Alarms Not Triggering**
   - Verify metric dimensions match service configuration
   - Check SQS queue permissions

3. **Alarm Processor Not Processing Messages**
   - Verify SQS event source mapping is configured
   - Check alarm processor logs in CloudWatch

### Debugging Commands

```bash
# Check DynamoDB state
aws dynamodb get-item \
  --table-name circuit-breaker-state \
  --key '{"pk":{"S":"system-state"}}'

# Check SQS queue
aws sqs get-queue-attributes \
  --queue-url https://sqs.region.amazonaws.com/account/circuit-breaker-alarms

# View Lambda logs
aws logs filter-log-events \
  --log-group-name /aws/lambda/circuit-breaker-controller \
  --start-time $(date -d '1 hour ago' +%s)000
```

## 🔄 Deployment

### Infrastructure Updates

```bash
cd infrastructure
./deploy.sh --environment prod --region us-west-2
```

### Lambda Updates

```bash
# Package and deploy each service
zip -r full-service.zip full-service/ shared/
aws lambda update-function-code \
  --function-name full-service \
  --zip-file fileb://full-service.zip
```

### Rollback Strategy

1. Keep previous Lambda versions
2. Use CloudFormation stack rollback for infrastructure
3. Monitor metrics during deployment

## 📞 Support

For questions or issues:
1. Check CloudWatch logs and metrics
2. Review alarm states and SQS queues
3. Verify DynamoDB state consistency
4. Monitor circuit breaker transitions

## 📄 License

This project is for demonstration purposes. Ensure proper testing before production use.

## 🤝 Contributing

1. Follow existing code patterns
2. Update documentation for changes
3. Test all circuit breaker transitions
4. Verify CloudWatch metrics and alarms