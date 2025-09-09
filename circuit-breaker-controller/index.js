const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const dynamoDBClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamoDBClient);
const cloudwatch = new CloudWatchClient({});

// Import DynamoDB operations
const dynamoOperations = require('./dynamodb-operations');

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
                Unit: metricName === 'ResponseTime' ? 'Milliseconds' : 'Count',
                Dimensions: dimensions,
                Timestamp: new Date()
            }]
        };
        
        await cloudwatch.send(new PutMetricDataCommand(params));
    } catch (error) {
        console.error('Failed to publish metric:', error);
    }
}

/**
 * Get service endpoint based on current level
 */
function getServiceEndpoint(level) {
    const endpoints = {
        1: process.env.FULL_SERVICE_FUNCTION || 'full-service',
        2: process.env.DEGRADED_SERVICE_FUNCTION || 'degraded-service',
        3: process.env.MAINTENANCE_SERVICE_FUNCTION || 'maintenance-service'
    };
    
    return endpoints[level] || endpoints[3]; // Default to maintenance if unknown level
}

/**
 * CIRCUIT BREAKER CONTROLLER
 * 
 * Funcionalidad a implementar:
 * 1. Monitorear errores del sistema desde CloudWatch Metrics
 * 2. Detectar cuando se alcanzan los umbrales de error:
 *    - 5+ errores: Transición de Nivel 1 → Nivel 2
 *    - 10+ errores: Transición de Nivel 2 → Nivel 3
 * 3. Manejar recuperación del sistema:
 *    - 3+ éxitos consecutivos: Nivel 3 → Nivel 2
 *    - 5+ éxitos consecutivos: Nivel 2 → Nivel 1
 * 4. Actualizar estado del sistema en DynamoDB
 * 5. Registrar transiciones en CloudWatch Logs
 * 6. Exponer endpoint para consultar estado actual del sistema
 * 
 * Variables de entorno requeridas:
 * - STATE_TABLE: Nombre de tabla DynamoDB para estado del sistema
 * - FULL_SERVICE_FUNCTION: ARN de Lambda Nivel 1
 * - DEGRADED_SERVICE_FUNCTION: ARN de Lambda Nivel 2  
 * - MAINTENANCE_SERVICE_FUNCTION: ARN de Lambda Nivel 3
 */

exports.handler = async (event) => {
    const startTime = Date.now();
    const httpMethod = event.httpMethod || 'GET';
    
    try {
        console.log('Circuit Breaker Controller invoked:', JSON.stringify(event, null, 2));
        console.log('HTTP Method:', httpMethod);
        
        // Get current system state from DynamoDB
        const systemState = await dynamoOperations.getSystemState();
        console.log('Current system state:', systemState);
        
        // Handle GET requests (status checks)
        if (httpMethod === 'GET') {
            return await handleStatusRequest(event, systemState, startTime);
        }
        
        // Handle POST requests (service routing for K6 tests)
        if (httpMethod === 'POST') {
            return await handleServiceRequest(event, systemState, startTime);
        }
        
        // Unsupported method
        return {
            statusCode: 405,
            headers: {
                'Content-Type': 'application/json',
                'Allow': 'GET, POST'
            },
            body: JSON.stringify({
                error: 'Method not allowed',
                message: `HTTP method ${httpMethod} is not supported`,
                allowedMethods: ['GET', 'POST'],
                timestamp: new Date().toISOString()
            })
        };
        
    } catch (error) {
        console.error('Circuit Breaker Controller error:', error);
        
        // Log error metric
        await publishMetric('CircuitBreaker/Controller', 'Error', 1, [
            { Name: 'ErrorType', Value: error.name || 'UnknownError' }
        ]);
        
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'X-Circuit-Breaker-Level': '3', // Fail to maintenance mode
                'X-Active-Service': 'maintenance-service'
            },
            body: JSON.stringify({
                circuitBreaker: {
                    currentLevel: 3,
                    activeService: 'maintenance-service',
                    status: 'error',
                    error: 'Controller error - defaulting to maintenance mode'
                },
                error: {
                    message: 'Internal server error in Circuit Breaker Controller',
                    details: error.message,
                    timestamp: new Date().toISOString()
                }
            })
        };
    }
};

/**
 * Handle GET requests - return circuit breaker status
 */
async function handleStatusRequest(event, systemState, startTime) {
    // Log controller invocation metric
    await publishMetric('CircuitBreaker/Controller', 'StatusRequest', 1, [
        { Name: 'CurrentLevel', Value: systemState.currentLevel.toString() }
    ]);
    
    // Determine which service to route to based on current level
    const activeServiceEndpoint = getServiceEndpoint(systemState.currentLevel);
    const serviceTypeMap = {
        1: 'full-service',
        2: 'degraded-service', 
        3: 'maintenance-service'
    };
    const activeServiceType = serviceTypeMap[systemState.currentLevel];
    
    // Log system state to CloudWatch
    await publishMetric('CircuitBreaker/Controller', 'CurrentLevel', systemState.currentLevel, []);
    await publishMetric('CircuitBreaker/Controller', 'FailureCount', systemState.failureCount, []);
    await publishMetric('CircuitBreaker/Controller', 'SuccessCount', systemState.successCount, []);
    
    // Get recent activity for dashboard/monitoring
    const recentFailures = await dynamoOperations.getRecentFailures(5);
    const recentSuccesses = await dynamoOperations.getRecentSuccesses(5);
    
    // Calculate response time
    const responseTime = Date.now() - startTime;
    
    // Log controller metrics
    await publishMetric('CircuitBreaker/Controller', 'ResponseTime', responseTime, []);
    await publishMetric('CircuitBreaker/Controller', 'Success', 1, [
        { Name: 'CurrentLevel', Value: systemState.currentLevel.toString() }
    ]);
    
    console.log('Circuit Breaker Controller status request completed successfully:', {
        currentLevel: systemState.currentLevel,
        activeService: activeServiceType,
        failureCount: systemState.failureCount,
        successCount: systemState.successCount,
        lastTransition: systemState.lastTransition,
        responseTime: responseTime
    });
    
    // Comprehensive response with system state and routing information
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'X-Circuit-Breaker-Level': systemState.currentLevel.toString(),
            'X-Active-Service': activeServiceType
        },
        body: JSON.stringify({
            circuitBreaker: {
                currentLevel: systemState.currentLevel,
                activeService: activeServiceType,
                serviceEndpoint: activeServiceEndpoint,
                status: systemState.currentLevel === 1 ? 'healthy' : 
                        systemState.currentLevel === 2 ? 'degraded' : 'maintenance',
                state: {
                    failureCount: systemState.failureCount,
                    successCount: systemState.successCount,
                    lastTransition: systemState.lastTransition,
                    transitionReason: systemState.transitionReason,
                    lastUpdated: systemState.lastUpdated
                },
                thresholds: {
                    level1to2: '5 failures',
                    level2to3: '10 failures',
                    level3to2: '3 consecutive successes',
                    level2to1: '5 consecutive successes'
                },
                recentActivity: {
                    failures: recentFailures.length,
                    successes: recentSuccesses.length,
                    timeWindow: '5 minutes'
                }
            },
            routing: {
                recommendedService: activeServiceType,
                serviceEndpoint: activeServiceEndpoint,
                level: systemState.currentLevel
            },
            metadata: {
                timestamp: new Date().toISOString(),
                responseTime: responseTime,
                controllerVersion: '1.0.0'
            }
        })
    };
}

/**
 * Handle POST requests - route to appropriate service based on circuit breaker level
 */
async function handleServiceRequest(event, systemState, startTime) {
    const lambda = new LambdaClient({});
    
    console.log('Handling service request, current level:', systemState.currentLevel);
    
    // Log controller invocation metric
    await publishMetric('CircuitBreaker/Controller', 'ServiceRequest', 1, [
        { Name: 'CurrentLevel', Value: systemState.currentLevel.toString() }
    ]);
    
    // Determine target service based on current circuit breaker level
    const serviceTypeMap = {
        1: 'full-service',
        2: 'degraded-service', 
        3: 'maintenance-service'
    };
    const targetServiceType = serviceTypeMap[systemState.currentLevel];
    const targetServiceFunction = getServiceEndpoint(systemState.currentLevel);
    
    try {
        console.log(`Routing request to ${targetServiceType} (${targetServiceFunction})`);
        
        // Invoke the appropriate service Lambda function
        const serviceEvent = {
            ...event,
            // Add circuit breaker context to the event
            circuitBreakerContext: {
                currentLevel: systemState.currentLevel,
                controllerTimestamp: new Date().toISOString()
            }
        };
        
        const invokeParams = {
            FunctionName: targetServiceFunction,
            InvocationType: 'RequestResponse', // Synchronous invocation
            Payload: JSON.stringify(serviceEvent)
        };
        
        const serviceResponse = await lambda.send(new InvokeCommand(invokeParams));
        
        // Check if Lambda execution failed
        if (serviceResponse.FunctionError) {
            console.log(`Lambda execution failed for ${targetServiceType}:`, serviceResponse.FunctionError);
            
            // Log the failure in DynamoDB circuit breaker state
            await dynamoOperations.incrementFailureCount(targetServiceType, 'LambdaExecutionError', systemState.currentLevel);
            
            // Log routing error
            await publishMetric('CircuitBreaker/Controller', 'RoutingError', 1, [
                { Name: 'TargetService', Value: targetServiceType },
                { Name: 'CurrentLevel', Value: systemState.currentLevel.toString() },
                { Name: 'ErrorType', Value: 'LambdaExecutionError' }
            ]);
            
            // Return error response for failed service
            return {
                statusCode: 503,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Circuit-Breaker-Level': systemState.currentLevel.toString(),
                    'X-Circuit-Breaker-Controller': 'true',
                    'X-Routed-To': targetServiceType
                },
                body: JSON.stringify({
                    service: `Circuit Breaker Controller - ${targetServiceType} failed`,
                    level: systemState.currentLevel,
                    status: 'service_failure',
                    message: 'Service execution failed - circuit breaker failure recorded',
                    error: 'Lambda function execution error',
                    targetService: targetServiceType,
                    timestamp: new Date().toISOString()
                })
            };
        }
        
        // Parse service response
        let parsedResponse;
        if (serviceResponse.Payload) {
            // AWS SDK v3 returns Payload as Uint8Array, convert to string first
            const payloadString = new TextDecoder().decode(serviceResponse.Payload);
            parsedResponse = JSON.parse(payloadString);
        } else {
            throw new Error('No response payload from service');
        }
        
        // Check if service returned an error status code
        if (parsedResponse.statusCode >= 400) {
            console.log(`Service ${targetServiceType} returned error status:`, parsedResponse.statusCode);
            
            // Log the failure in DynamoDB circuit breaker state
            await dynamoOperations.incrementFailureCount(targetServiceType, 'ServiceError', systemState.currentLevel);
            
            // Log routing error
            await publishMetric('CircuitBreaker/Controller', 'RoutingError', 1, [
                { Name: 'TargetService', Value: targetServiceType },
                { Name: 'CurrentLevel', Value: systemState.currentLevel.toString() },
                { Name: 'ErrorType', Value: 'ServiceError' }
            ]);
        } else {
            // Log success in DynamoDB circuit breaker state
            await dynamoOperations.incrementSuccessCount(targetServiceType, systemState.currentLevel, Date.now() - startTime);
            
            // Log routing success
            await publishMetric('CircuitBreaker/Controller', 'RoutingSuccess', 1, [
                { Name: 'TargetService', Value: targetServiceType },
                { Name: 'CurrentLevel', Value: systemState.currentLevel.toString() }
            ]);
        }
        
        console.log(`Successfully routed request to ${targetServiceType}:`, {
            statusCode: parsedResponse.statusCode,
            currentLevel: systemState.currentLevel,
            responseTime: Date.now() - startTime
        });
        
        // Add circuit breaker headers to the service response
        if (parsedResponse.headers) {
            parsedResponse.headers['X-Circuit-Breaker-Level'] = systemState.currentLevel.toString();
            parsedResponse.headers['X-Circuit-Breaker-Controller'] = 'true';
            parsedResponse.headers['X-Routed-To'] = targetServiceType;
        }
        
        return parsedResponse;
        
    } catch (error) {
        console.error(`Error routing request to ${targetServiceType}:`, error);
        
        // Log routing error
        await publishMetric('CircuitBreaker/Controller', 'RoutingError', 1, [
            { Name: 'TargetService', Value: targetServiceType },
            { Name: 'CurrentLevel', Value: systemState.currentLevel.toString() },
            { Name: 'ErrorType', Value: error.name || 'UnknownError' }
        ]);
        
        // Fall back to maintenance mode response
        return {
            statusCode: 503,
            headers: {
                'Content-Type': 'application/json',
                'X-Circuit-Breaker-Level': '3',
                'X-Circuit-Breaker-Controller': 'true',
                'X-Routed-To': 'maintenance-fallback'
            },
            body: JSON.stringify({
                service: 'Circuit Breaker Controller - Fallback',
                level: 3,
                status: 'routing_error',
                message: 'Error routing to service, falling back to maintenance mode',
                error: error.message,
                originalTarget: {
                    service: targetServiceType,
                    function: targetServiceFunction,
                    level: systemState.currentLevel
                },
                timestamp: new Date().toISOString()
            })
        };
    }
}