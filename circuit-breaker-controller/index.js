const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const cloudwatch = new AWS.CloudWatch();

// Import DynamoDB operations
const dynamoOperations = require('../shared/dynamodb-operations');

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
        
        await cloudwatch.putMetricData(params).promise();
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
    
    try {
        console.log('Circuit Breaker Controller invoked:', JSON.stringify(event, null, 2));
        
        // Get current system state from DynamoDB
        const systemState = await dynamoOperations.getSystemState();
        console.log('Current system state:', systemState);
        
        // Log controller invocation metric
        await publishMetric('CircuitBreaker/Controller', 'Invocation', 1, [
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
        
        console.log('Circuit Breaker Controller completed successfully:', {
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