const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const cloudwatch = new CloudWatchClient({});

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
 * NIVEL 3 - MODO MANTENIMIENTO
 * 
 * Funcionalidad a implementar:
 * 1. Responder con mensajes de mantenimiento según especificación:
 *    - ERROR: "Nivel 3: Sistema bajo mantenimiento, intente más tarde"
 *    - ÉXITO: "Nivel 3: Operación al mínimo"
 * 2. Simular fallas ocasionales (10% probabilidad) para determinar mensaje
 * 3. Registrar métricas de éxito/error en CloudWatch
 * 4. Proveer funcionalidad mínima garantizada del sistema
 * 5. Sin acceso a datos de cuentas ni transferencias
 * 
 * Este es el nivel de máxima degradación con funcionalidad mínima
 */

exports.handler = async (event) => {
    const startTime = Date.now();
    
    try {
        console.log('Nivel 3 - Maintenance Service invoked:', JSON.stringify(event, null, 2));
        
        // Parse request body for K6 test payload
        let requestBody = {};
        let shouldFail = false;
        
        if (event.body) {
            try {
                requestBody = JSON.parse(event.body);
                console.log('Parsed request body:', requestBody);
                
                // Use error field from K6 payload to determine if we should fail
                shouldFail = requestBody.error === true;
                
                
            } catch (parseError) {
                console.log('Could not parse request body, using defaults:', parseError.message);
            }
        }
        
        console.log('Level 3 processing request, shouldFail:', shouldFail);
        
        // Simulate minimal processing time for maintenance mode
        await new Promise(resolve => setTimeout(resolve, Math.random() * 20 + 10));
        
        if (shouldFail) {
            // Log error metric to CloudWatch
            await publishMetric('CircuitBreaker/Service', 'Error', 1, [
                { Name: 'ServiceLevel', Value: '3' },
                { Name: 'ServiceType', Value: 'maintenance-service' },
                { Name: 'ErrorType', Value: 'MaintenanceFailure' }
            ]);
            
            console.log('Nivel 3 - Error metric published to CloudWatch');
            
            // Respuesta de error según especificación
            return {
                statusCode: 503,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Service-Level': '3',
                    'X-Service-Type': 'maintenance-service'
                },
                body: JSON.stringify({
                        level: 3,
                        status: 'maintenance_error',
                    message: 'Nivel 3: Sistema bajo mantenimiento, intente más tarde',
                    testInfo: {
                        requestedError: requestBody.error,
                        actualError: true,
                        requestTimestamp: requestBody.timestamp,
                        responseTime: Date.now() - startTime
                    },
                })
            };
        } else {
            // Log success metric to CloudWatch
            await publishMetric('CircuitBreaker/Service', 'Success', 1, [
                { Name: 'ServiceLevel', Value: '3' },
                { Name: 'ServiceType', Value: 'maintenance-service' }
            ]);
            
            // Log response time metric
            await publishMetric('CircuitBreaker/Service', 'ResponseTime', Date.now() - startTime, [
                { Name: 'ServiceLevel', Value: '3' },
                { Name: 'ServiceType', Value: 'maintenance-service' }
            ]);
            
            console.log('Nivel 3 - Success metric published to CloudWatch');
            
            // Respuesta de éxito según especificación
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Service-Level': '3',
                    'X-Service-Type': 'maintenance-service'
                },
                body: JSON.stringify({
                        level: 3,
                        status: 'maintenance_minimal',
                    message: 'Nivel 3: Operación al mínimo',
                    testInfo: {
                        requestedError: requestBody.error,
                        actualError: false,
                        requestTimestamp: requestBody.timestamp,
                        responseTime: Date.now() - startTime
                    },
                    data: {
                        balance: null,
                        transfers: null,
                        note: 'Solo funcionalidad mínima disponible'
                    },
                })
            };
        }
        
    } catch (error) {
        console.error('Nivel 3 - Error crítico:', error);
        
        // Log critical error metric to CloudWatch
        await publishMetric('CircuitBreaker/Service', 'Error', 1, [
            { Name: 'ServiceLevel', Value: '3' },
            { Name: 'ServiceType', Value: 'maintenance-service' },
            { Name: 'ErrorType', Value: 'CriticalError' }
        ]);
        
        console.log('Nivel 3 - Critical error metric published to CloudWatch');
        
        return {
            statusCode: 503,
            headers: {
                'Content-Type': 'application/json',
                'X-Service-Level': '3',
                'X-Service-Type': 'maintenance-service'
            },
            body: JSON.stringify({
                level: 3,
                status: 'critical_error',
                message: 'Nivel 3: Sistema bajo mantenimiento, intente más tarde',
                error: 'Error crítico del sistema',
            })
        };
    }
};