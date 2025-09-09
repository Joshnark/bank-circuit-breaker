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
 * NIVEL 1 - SERVICIO COMPLETO
 * 
 * Funcionalidad a implementar:
 * 1. Consultar balance completo de la cuenta desde base de datos
 * 2. Obtener historial COMPLETO de transferencias (operación costosa)
 * 3. Simular fallas aleatorias para testing del circuit breaker (5% probabilidad)
 * 4. Registrar métricas de éxito/error en CloudWatch
 * 5. Responder con:
 *    - Balance de cuenta
 *    - Lista completa de transferencias
 *    - Funcionalidades disponibles
 * 
 * Este es el nivel de mayor funcionalidad pero también el más costoso computacionalmente
 */

exports.handler = async (event) => {
    const startTime = Date.now();
    
    try {
        console.log('Nivel 1 - Full Service invoked:', JSON.stringify(event, null, 2));
        
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

        console.log('Level 1 processing request, shouldFail:', shouldFail);
        
        if (shouldFail) {
            throw new Error('Controlled failure triggered by test payload');
        }
        

        // Log success metric to CloudWatch
        await publishMetric('CircuitBreaker/Service', 'Success', 1, [
            { Name: 'ServiceLevel', Value: '1' },
            { Name: 'ServiceType', Value: 'full-service' }
        ]);
        
        // Log response time metric
        await publishMetric('CircuitBreaker/Service', 'ResponseTime', Date.now() - startTime, [
            { Name: 'ServiceLevel', Value: '1' },
            { Name: 'ServiceType', Value: 'full-service' }
        ]);
        
        console.log('Nivel 1 - Success metric published to CloudWatch');
        
        const response = {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'X-Service-Level': '1',
                'X-Service-Type': 'full-service'
            },
            body: JSON.stringify({
                level: 1,
                status: 'operational',
                message: 'Full service available',
                data: {
                    balance: 12500.75,
                    transfers: [
                        { id: 1, amount: 500, type: 'credit' },
                        { id: 2, amount: 250, type: 'debit' },
                        { id: 3, amount: 1000, type: 'credit' }
                    ]
                }
            })
        };

        console.log('Nivel 1 - Respuesta exitosa');
        return response;
        
    } catch (error) {
        console.error('Nivel 1 - Error:', error);
        
        // Log error metric to CloudWatch
        await publishMetric('CircuitBreaker/Service', 'Error', 1, [
            { Name: 'ServiceLevel', Value: '1' },
            { Name: 'ServiceType', Value: 'full-service' },
            { Name: 'ErrorType', Value: error.message.includes('Simulated') ? 'SimulatedFailure' : 'SystemError' }
        ]);
        
        console.log('Nivel 1 - Error metric published to CloudWatch');
        
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'X-Service-Level': '1',
                'X-Service-Type': 'full-service'
            },
            body: JSON.stringify({
                level: 1,
                status: 'error',
                message: 'Full service error'
            })
        };
    }
};