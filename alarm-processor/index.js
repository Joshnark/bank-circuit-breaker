const AWS = require('aws-sdk');
const cloudwatch = new AWS.CloudWatch();

// Import DynamoDB operations
const dynamoOperations = require('../shared/dynamodb-operations');

/**
 * ALARM PROCESSOR LAMBDA
 * 
 * Processes CloudWatch alarm notifications from SQS queue:
 * 1. Parse alarm messages from SQS
 * 2. Determine if alarm is for failure or recovery
 * 3. Update DynamoDB state accordingly
 * 4. Log processing results to CloudWatch
 * 
 * Expected alarm message format:
 * - ServiceLevel dimension: "1", "2", or "3" 
 * - ServiceType dimension: "full-service", "degraded-service", "maintenance-service"
 * - AlarmName patterns:
 *   - "CircuitBreaker-ErrorRate-Level{N}" for failure alarms
 *   - "CircuitBreaker-Recovery-Level{N}" for recovery alarms
 */

/**
 * Publishes metrics to CloudWatch
 */
async function publishMetric(namespace, metricName, value, dimensions) {
    try {
        const params = {
            Namespace: namespace,
            MetricData: [{
                MetricName: metricName,
                Value: value,
                Unit: 'Count',
                Dimensions: dimensions,
                Timestamp: new Date()
            }]
        };
        
        await cloudwatch.putMetricData(params).promise();
    } catch (error) {
        console.error('Failed to publish metric:', error);
    }
}

/**
 * Parse CloudWatch alarm message
 */
function parseAlarmMessage(message) {
    try {
        // Handle both direct alarm object and stringified JSON
        let alarmData;
        if (typeof message === 'string') {
            alarmData = JSON.parse(message);
        } else {
            alarmData = message;
        }
        
        // Extract alarm details
        const alarmName = alarmData.AlarmName;
        const alarmDescription = alarmData.AlarmDescription;
        const newStateValue = alarmData.NewStateValue;
        const oldStateValue = alarmData.OldStateValue;
        const stateReason = alarmData.StateReason;
        
        // Determine alarm type and service details from alarm name
        const isFailureAlarm = alarmName.includes('ErrorRate') || alarmName.includes('Failure');
        const isRecoveryAlarm = alarmName.includes('Recovery') || alarmName.includes('Success');
        
        // Extract service level from alarm name (assumes format like "CircuitBreaker-ErrorRate-Level1")
        const levelMatch = alarmName.match(/Level(\d+)/);
        const serviceLevel = levelMatch ? levelMatch[1] : '1';
        
        // Map service level to service type
        const serviceTypeMap = {
            '1': 'full-service',
            '2': 'degraded-service', 
            '3': 'maintenance-service'
        };
        
        const serviceType = serviceTypeMap[serviceLevel] || 'unknown-service';
        
        return {
            alarmName,
            alarmDescription,
            newStateValue,
            oldStateValue,
            stateReason,
            isFailureAlarm,
            isRecoveryAlarm,
            serviceLevel: parseInt(serviceLevel),
            serviceType,
            isAlarmState: newStateValue === 'ALARM',
            isOkState: newStateValue === 'OK'
        };
        
    } catch (error) {
        console.error('Error parsing alarm message:', error);
        throw new Error(`Failed to parse alarm message: ${error.message}`);
    }
}

/**
 * Process a failure alarm
 */
async function processFailureAlarm(alarmInfo) {
    console.log('Processing failure alarm:', alarmInfo.alarmName);
    
    try {
        // Determine error type based on alarm
        let errorType = 'SystemError';
        if (alarmInfo.alarmName.includes('Timeout')) {
            errorType = 'TimeoutError';
        } else if (alarmInfo.alarmName.includes('Rate')) {
            errorType = 'HighErrorRate';
        }
        
        // Update DynamoDB with failure
        const result = await dynamoOperations.incrementFailureCount(
            alarmInfo.serviceType,
            errorType,
            alarmInfo.serviceLevel
        );
        
        // Log alarm processing metric
        await publishMetric('CircuitBreaker/AlarmProcessor', 'FailureAlarmProcessed', 1, [
            { Name: 'ServiceType', Value: alarmInfo.serviceType },
            { Name: 'ServiceLevel', Value: alarmInfo.serviceLevel.toString() },
            { Name: 'AlarmName', Value: alarmInfo.alarmName }
        ]);
        
        console.log('Failure alarm processed successfully:', {
            alarmName: alarmInfo.alarmName,
            transitioned: result.transitioned,
            newState: result.state
        });
        
        return result;
        
    } catch (error) {
        console.error('Error processing failure alarm:', error);
        
        // Log processing error metric
        await publishMetric('CircuitBreaker/AlarmProcessor', 'ProcessingError', 1, [
            { Name: 'AlarmName', Value: alarmInfo.alarmName },
            { Name: 'ErrorType', Value: 'FailureProcessingError' }
        ]);
        
        throw error;
    }
}

/**
 * Process a recovery alarm
 */
async function processRecoveryAlarm(alarmInfo) {
    console.log('Processing recovery alarm:', alarmInfo.alarmName);
    
    try {
        // For recovery alarms, we simulate a success event
        const result = await dynamoOperations.incrementSuccessCount(
            alarmInfo.serviceType,
            alarmInfo.serviceLevel,
            50 // Default response time for recovery
        );
        
        // Log alarm processing metric
        await publishMetric('CircuitBreaker/AlarmProcessor', 'RecoveryAlarmProcessed', 1, [
            { Name: 'ServiceType', Value: alarmInfo.serviceType },
            { Name: 'ServiceLevel', Value: alarmInfo.serviceLevel.toString() },
            { Name: 'AlarmName', Value: alarmInfo.alarmName }
        ]);
        
        console.log('Recovery alarm processed successfully:', {
            alarmName: alarmInfo.alarmName,
            transitioned: result.transitioned,
            newState: result.state
        });
        
        return result;
        
    } catch (error) {
        console.error('Error processing recovery alarm:', error);
        
        // Log processing error metric
        await publishMetric('CircuitBreaker/AlarmProcessor', 'ProcessingError', 1, [
            { Name: 'AlarmName', Value: alarmInfo.alarmName },
            { Name: 'ErrorType', Value: 'RecoveryProcessingError' }
        ]);
        
        throw error;
    }
}

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
    console.log('Alarm Processor invoked:', JSON.stringify(event, null, 2));
    
    const results = [];
    
    try {
        // Process each SQS record
        for (const record of event.Records) {
            try {
                console.log('Processing SQS record:', record.messageId);
                
                // Parse the message body (CloudWatch alarm notification)
                const messageBody = JSON.parse(record.body);
                
                // Handle SNS message wrapper if present
                let alarmMessage;
                if (messageBody.Type === 'Notification' && messageBody.Message) {
                    alarmMessage = JSON.parse(messageBody.Message);
                } else {
                    alarmMessage = messageBody;
                }
                
                // Parse alarm details
                const alarmInfo = parseAlarmMessage(alarmMessage);
                console.log('Parsed alarm info:', alarmInfo);
                
                // Skip processing if alarm is returning to OK state (not actionable)
                if (alarmInfo.isOkState) {
                    console.log('Alarm returned to OK state, no action needed');
                    continue;
                }
                
                // Only process ALARM state
                if (!alarmInfo.isAlarmState) {
                    console.log('Alarm state is not ALARM, skipping');
                    continue;
                }
                
                let processingResult;
                
                // Route to appropriate processor based on alarm type
                if (alarmInfo.isFailureAlarm) {
                    processingResult = await processFailureAlarm(alarmInfo);
                } else if (alarmInfo.isRecoveryAlarm) {
                    processingResult = await processRecoveryAlarm(alarmInfo);
                } else {
                    console.log('Unknown alarm type, skipping:', alarmInfo.alarmName);
                    continue;
                }
                
                results.push({
                    messageId: record.messageId,
                    alarmName: alarmInfo.alarmName,
                    processed: true,
                    transitioned: processingResult.transitioned,
                    newLevel: processingResult.state.currentLevel
                });
                
            } catch (recordError) {
                console.error('Error processing SQS record:', recordError);
                
                results.push({
                    messageId: record.messageId,
                    processed: false,
                    error: recordError.message
                });
                
                // Log individual record processing error
                await publishMetric('CircuitBreaker/AlarmProcessor', 'RecordProcessingError', 1, [
                    { Name: 'MessageId', Value: record.messageId }
                ]);
            }
        }
        
        // Log overall processing metrics
        const processedCount = results.filter(r => r.processed).length;
        const errorCount = results.filter(r => !r.processed).length;
        
        await publishMetric('CircuitBreaker/AlarmProcessor', 'RecordsProcessed', processedCount, []);
        if (errorCount > 0) {
            await publishMetric('CircuitBreaker/AlarmProcessor', 'ProcessingErrors', errorCount, []);
        }
        
        console.log('Alarm processing completed:', {
            totalRecords: event.Records.length,
            processed: processedCount,
            errors: errorCount,
            results: results
        });
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Alarm processing completed',
                processed: processedCount,
                errors: errorCount,
                results: results
            })
        };
        
    } catch (error) {
        console.error('Critical error in alarm processor:', error);
        
        // Log critical error metric
        await publishMetric('CircuitBreaker/AlarmProcessor', 'CriticalError', 1, [
            { Name: 'ErrorType', Value: 'HandlerError' }
        ]);
        
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Critical error in alarm processor',
                message: error.message,
                processed: 0,
                errors: event.Records.length
            })
        };
    }
};